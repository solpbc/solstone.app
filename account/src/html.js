import { attrText, countText, htmlLang, htmlText, scriptText, t, termsText } from '../../i18n/account.mjs';

// Page renderers for the served portal.css design system and same-origin brand assets.

import { PORTAL_CSS_HREF, SUNARC_JS_SRC } from './assets.js';
import { ENROLL_JS } from './inline/passkey-enroll.js';
import { LANDING_JS } from './inline/passkey-landing.js';
import { SUPPORT_DRAFT_JS } from './inline/support-draft.js';
import { SME_SERVICE_PATH } from './sme-service.js';
import { SPP_SERVICE_PATH } from './spp-service.js';
import { KEY_FACTS_PAGE_HEADING, KEY_FACTS_SHARED_LINES, keyFactsLines, keyFactsPlanLines } from './rules-words.js';
import { formatLongDate, formatMomentUtc } from './withdrawal-rules.js';

// The cancel function's path, as cancel-contract.js serves it.
const CANCEL_CONTRACT_PATH_HTML = '/billing/cancel-contract';

export const VERIFY_ERROR = t('account.portal.thatcodedidntworktryagain');
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
const IC_BILLING_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8.5h6M9 11.5h6M9 14.5h3.5"/></svg>';
const IC_NET = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.4"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M6.6 7.4 10 10.4M17.4 7.4 14 10.4M6.6 16.6 10 13.6M17.4 16.6 14 13.6"/></svg>';
const IC_BACKUP = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/></svg>';
const IC_VAULT = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 12v3"/></svg>';
const IC_CHIP = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="10.5" y="10.5" width="3" height="3"/><path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3"/></svg>';
const IC_GLOBE = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.4 3.7 8.5S14.4 18.2 12 20.5C9.6 18.2 8.3 15.1 8.3 12S9.6 5.8 12 3.5Z"/></svg>';
const CHECK_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--orange-ink)"><circle cx="12" cy="12" r="9.5" stroke="currentColor"/><path d="M8 12.2l2.6 2.6L16 9" stroke="currentColor"/></svg>';
const SCOUT_PROGRAM_COVENANT = t('account.portal.confidentialprocessingnocontentisretainedno');
// The signed-in page lists every class the download carries (see handleTransparency), newest
// rows first and long histories shortened, so the lead claims kinds of record, not every row;
// support requests live on /support and the lead points there.
const TRANSPARENCY_LEAD_SIGNED_IN = t('account.portal.thispagelistseverykindrecordsol');
const TRANSPARENCY_LEAD_DOWNLOAD = t('account.portal.downloadbelowcarrieseachthemsupportrequests');
const TRANSPARENCY_LEAD_SIGNED_OUT = t('account.portal.onceyousigninthispagelists');
// Only what Article 8 and bylaws Article III commit sits under their sentence. What Stripe holds and
// the network address we keep are facts about this service, stated before it, never covenants.
const transparencyIntro = (lead) => `<p class="intro" style="margin-bottom:12px">${lead} ${htmlText('account.portal.weneverholdareadablecopyofyourjournalandwedont')} <a href="https://solpbc.org/privacy#billing">${htmlText('account.portal.privacypolicy')}</a> ${htmlText('account.portal.sayswhoelsecanseethemthereandwhy')}</p>
<p class="intro">${htmlText('account.portal.noanalyticsnobehavioraldatanothirdpartytrackin')} <a href="https://solpbc.org/articles#s8-3">${htmlText('account.portal.article8ofourarticlesofincorporation')}</a> ${htmlText('account.portal.restated20260501and')} <a href="https://solpbc.org/bylaws#art-3">${htmlText('account.portal.articleiiiofthebylaws')}</a>.</p>`;

function brandbar() {
  return `<div class="brandbar">${MARK_SVG}<span class="wordmark">solstone</span></div>`;
}

// During an active deletion, a session only reaches /account/delete* and, while
// the hold is open, the export carve-out (getValidSession). Portal links that
// need an ordinary session would sign the owner out on arrival, so deletion
// pages leave out the footer links to /transparency and /support.
function footer({ deletionActive = false } = {}) {
  const portalLinks = deletionActive ? '' : '<a href="/transparency">' + htmlText('account.deletion.datatransparency') + '</a><a href="/support">' + htmlText('account.portal.support') + '</a>';
  return `<footer class="footer">${portalLinks}<a href="https://status.solstone.app">${htmlText('account.portal.servicestatus')}</a><a href="/terms">${htmlText('account.portal.terms')}</a><a href="https://solpbc.org/privacy">${htmlText('account.portal.howweearnyourtrust')} ${EXT_SVG}</a><a href="https://solstone.app">${htmlText('account.portal.solstoneapp')}</a></footer>`;
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
    ? `<div class="head"><div class="lbl">${htmlText('account.signin.signedinas')}</div><div class="who">${esc(trimmedEmail)}</div><div class="seen">${htmlText('account.portal.lastsignin')} ${esc(formatRelativeTime(lastSignInAt, now))}</div></div>`
    : '';
  const home = deletion
    ? `<span class="home">${MARK_SVG}<span class="wordmark">solstone</span></span>`
    : `<a class="home" href="/">${MARK_SVG}<span class="wordmark">solstone</span></a>`;
  const links = deletion
    ? `<a href="/account/delete">${htmlText('account.deletion.closingyoursignin')}</a>${deletion.exportAvailable ? '\n      <a href="/account/export">' + htmlText('account.transparency.downloadwhatsolpbcholds') + '</a>' : ''}`
    : `<a href="/">${htmlText('account.portal.home')}</a>
      <a href="/sign-in">${htmlText('account.transparency.managesignin')}</a>`;
  // <details> never closes on its own when focus or a tap lands elsewhere. pointerdown,
  // not click: iOS Safari fires no click on a tap over non-interactive content.
  return `<div class="topbar">
  ${home}
  <details class="usermenu">
    <summary aria-label="${attrText('account.portal.menu')}"><span class="avatar">${avatar}</span>${CARET_SVG}</summary>
    <div class="menu" role="menu">
      ${head}
      ${links}
      <div class="sep"></div>
      <form method="post" action="/signout"><button class="mi signout" type="submit">${htmlText('account.signin.signout')}</button></form>
    </div>
  </details>
  <script>(function(){var m=document.currentScript.previousElementSibling;document.addEventListener('pointerdown',function(e){if(m.open&&!m.contains(e.target))m.open=false});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&m.open){m.open=false;m.querySelector('summary').focus()}})})();</script>
</div>`;
}

const BRANDLOCK = `<p class="brandlock"><span class="dot"></span>${htmlText('account.portal.yourjournalisalwaysprivateonlyyours')}</p>`;

function brandbarSignin() {
  return `<div class="topbar"><a class="home" href="/">${MARK_SVG}<span class="wordmark">solstone</span></a><a href="/?signin" style="color:var(--orange-text-aa);font-weight:600;text-decoration:none">${htmlText('account.portal.signin')}</a></div>`;
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
<html lang="${htmlLang()}">
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
    <div class="sunarc-twilight"></div>
    <div class="sunarc-glow"></div>
    <div class="sunarc-sun">${MARK_SVG}</div>
  </div>
  <main${mainClass ? ` class="${escAttr(mainClass)}"` : ''}>${body}${showFooter ? footer({ deletionActive }) : ''}</main>
  ${afterMain}
  <script src="${SUNARC_JS_SRC}" defer></script>
</body>
</html>`;
}

export function renderLanding(turnstileSiteKey, csrf, resume = {}, subhead = t('account.signin.signinmanageoptionalservicesyouve')) {
  const resumeHtml = resume.next && resume.nextSig
    ? `<input type="hidden" name="next" value="${escAttr(resume.next)}">
  <input type="hidden" name="next_sig" value="${escAttr(resume.nextSig)}">`
    : '';
  return layout({
    title: t('account.transparency.signinmanageyourservices'),
    body: `${brandbar()}
<h1>${htmlText('account.billing.yourservices')}</h1>
<p class="lead">${esc(subhead)}</p>
<div id="passkey-error" class="error" hidden></div>
<div class="card">
  <form method="post" action="/signin/start">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    ${resumeHtml}
    <label for="email">${htmlText('account.cancel.email')}</label>
    <input id="email" type="email" name="email" autocomplete="email webauthn" required placeholder="you@example.com" maxlength="254">
    <div class="cf-turnstile" data-sitekey="${escAttr(turnstileSiteKey)}" data-theme="auto"></div>
    <button class="btn primary block" type="submit">${htmlText('account.cancel.continue')}</button>
  </form>
</div>
<p class="disclosure">${htmlText('account.signin.noanalyticsandnotrackingthisis')}</p>
<p class="disclosure">${htmlText('account.signin.bysigninginyouagreetothe')} <a href="/terms">${htmlText('account.signin.terms')}</a>.</p>`,
    afterMain: `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script>${SUPPORT_DRAFT_JS}</script><script>${LANDING_JS}</script>`,
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
    ? `${htmlText('account.signin.codesentto')} <strong>${escapedEmail}</strong>${htmlText('account.signin.itexpires10minutesafterwesentit')}`
    : t('account.signin.enteryouremailand6digitcode');
  return layout({
    title: t('account.signin.verifyyourcode'),
    body: `${brandbar()}
<h1>${htmlText('account.signin.verifyyourcode')}</h1>
<p class="lead">${subhead}</p>
${errorHtml}
<div class="card">
  <form method="post" action="/signin/verify">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    ${resumeHtml}
    ${emailFieldHtml}
    <label for="code">${htmlText('account.deletion.n6digitcode')}</label>
    <input id="code" class="code" name="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autofocus required oninput="this.value=this.value.replace(/\\D/g,'').slice(0,6)">
    <button class="btn primary block" type="submit">${htmlText('account.signin.verify')}</button>
  </form>
</div>
<p class="disclosure">${htmlText('account.signin.didntgetit')} <a href="/">${htmlText('account.signin.requestanewcode')}</a>.</p>`,
  });
}

export function renderError() {
  return layout({
    title: t('account.portal.thatlinkdidntwork'),
    body: `${brandbar()}
<h1>${htmlText('account.portal.thatlinkdidntwork')}</h1>
<p class="lead">${htmlText('account.portal.linkyouusedmayhaveexpiredor')}</p>
<div class="card">
  <p style="margin:0 0 16px;color:var(--ink)">${htmlText('account.portal.pickupwhereyouleftoff')}</p>
  <ul style="margin:0 0 18px;padding-left:20px;color:var(--ink-soft)">
    <li style="margin-bottom:6px">${htmlText('account.portal.ifyoucameherefromyourjournal')}</li>
    <li>${htmlText('account.portal.otherwiseopenservicessolstoneappdirectlyand')}</li>
  </ul>
  <a class="btn primary block" href="/">${htmlText('account.portal.openyourservices')}</a>
</div>`,
  });
}

export function renderEnableScout() {
  return layout({
    title: t('account.scout.scout'),
    body: `${brandbar()}
<h1>${htmlText('account.scout.scout')}</h1>
<p class="lead">${htmlText('account.enable.scoutistesterprogramapprovedscoutscan')}</p>
<div class="card">
  <h2>${htmlText('account.enable.continuewithscout')}</h2>
  <p>${htmlText('account.enable.requestscoutaccessorreviewyourscout')}</p>
  <p><a href="/scout">${htmlText('account.enable.openscout')}</a></p>
</div>`,
  });
}

// === one pattern for every turn-on screen ===
// (adopted 2026-09-21 with operator approval; the sign-in-bound push consent retired with it)

// Card 1 is one shared constant on every turn-on screen: the request is tied to the
// owner's sign-in, no journal content comes with it, and allowing it is recorded.
const TURN_ON_CARD_1 = `<div class="grant">
    <div class="n">1</div>
    <div>
      <div class="gt">${htmlText('account.portal.requestistiedyoursignin')}</div>
      <div class="gd">${htmlText('account.portal.solpbccanapproveitbecauseit')}</div>
    </div>
  </div>`;

// A surface that can't draw the mark names a journal by this label and its id.
function journalIdLabel(id) {
  return `${htmlText('account.portal.journal')} <span style="${TRANSPARENCY_MONO}">${esc(id)}</span>`;
}

function turnOnLead(service, instance = '') {
  const sentence = t('account.portal.solpbcreceivedarequesttoturnonforyourjournalit', { service });
  return instance
    ? `${sentence}<span style="display:block;margin-top:6px">${journalIdLabel(instance)}</span>`
    : sentence;
}

// One shared footer for every turn-on screen: reversibility, the subscription
// caveat on paid services, the terms link (always /terms, never a redirecting
// alias), and the privacy-policy anchor for what sol pbc keeps.
function turnOnFooter({ paid, policyAnchor }) {
  const subscriptionClause = paid ? t('account.portal.turningitoffdoesntcancelasubscription') : '';
  return `<p class="disclosure">${htmlText('account.portal.youcanturnitofffromthejournalanytime')}${subscriptionClause} ${htmlText('account.portal.byturningthisonyouagreetothe')} <a href="/terms">${htmlText('account.portal.turnonterms')}</a>${htmlText('account.portal.whatsolpbckeepsisinthe')} <a href="https://solpbc.org/privacy#${policyAnchor}">${htmlText('account.portal.privacypolicy')}</a>.</p>`;
}

function restorePolicyFooter(policyAnchor) {
  return `<p class="disclosure">${htmlText('account.portal.whatsolpbckeepsisinthe2')} <a href="https://solpbc.org/privacy#${policyAnchor}">${htmlText('account.portal.privacypolicy')}</a>.</p>`;
}

// The three follow-on templates every turn-on flow shares (rule 8); the service
// name is the only variable. Restore's own three follow-on pages are its own
// (rule 7) and stay with renderEnableSpbRestore* below.
//
// The done page can't see the journal. Allowing parks the answer here for the
// journal to collect, and a journal that stopped waiting (it waits about fifteen
// minutes, and a restart ends the wait) never collects it. So the page never
// claims the service is on: it sends the owner back to the journal to check,
// and says what to do when it isn't.
function enableDoneTemplate(service) {
  return layout({
    title: t('account.portal.youallowed', { service }),
    body: `${brandbar()}
<div class="card" data-enable-state="done">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${CHECK_SVG} ${htmlText('account.portal.youallowed2')} ${service}</h2>
  <p>${htmlText('account.enable.gobackyourjournalcheckthatit')}</p>
  <p>${htmlText('account.portal.ifyourjournalstillshows')} ${service} ${htmlText('account.portal.asoffturn')} ${service} ${htmlText('account.portal.onagainfromyourjournal')}</p>
</div>`,
  });
}

function enableNeedsSubscriptionTemplate({ service, href }) {
  return layout({
    title: t('account.enable.subscriptionisneeded'),
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${htmlText('account.enable.subscriptionisneeded')}</h2>
  <p>${service} ${htmlText('account.portal.needsanactivesubscriptionbeforeitcanturnonyour')} ${service} ${htmlText('account.portal.onagaininyourjournal')}</p>
  <a class="btn primary" href="${escAttr(href)}">${htmlText('account.portal.setup')} ${service}</a>
</div>`,
  });
}

function enableErrorTemplate(service, { journalUpdate = false } = {}) {
  const message = journalUpdate
    ? `<p data-notice="journal-update">${htmlText('account.portal.yourjournalneedsanupdatebeforeitcanturnthison')}</p>
  <p>${htmlText('account.portal.updateyourjournalonthecomputeritrunsonthenturn')} ${service} ${htmlText('account.portal.onagainfromyourjournal')}</p>`
    : `<p>${htmlText('account.enable.somethingdidntlookrightwiththat')}</p>
  <p>${htmlText('account.enable.ifyougotherefromyourjournal')}</p>`;
  return layout({
    title: t('account.portal.couldnotturnon', { service }),
    body: `${brandbar()}
<div class="card">
  <h1>${htmlText('account.portal.couldnotturnon2')} ${service}</h1>
  ${message}
</div>`,
  });
}

function renderProofInputs(proof) {
  if (!proof || proof.kind !== 'supplied') return '';
  const parts = [];
  for (const assertion of proof.assertions) {
    parts.push(`<input type="hidden" name="assertion" value="${escAttr(assertion)}">`);
  }
  for (const caPubkey of proof.caPubkeys) {
    parts.push(`<input type="hidden" name="ca_pubkey" value="${escAttr(caPubkey)}">`);
  }
  return parts.length > 0 ? parts.join('\n    ') + '\n    ' : '';
}

export function renderEnableSplConsent({ csrf, nonce, instance = '', proof = null }) {
  const instanceInput = instance
    ? `<input type="hidden" name="instance" value="${escAttr(instance)}">`
    : '';
  return layout({
    title: t('account.enable.turnonprivatenetwork'),
    body: `${brandbar()}
<h1>${htmlText('account.services.turnonprivatenetwork')}</h1>
<p class="lead">${turnOnLead(t('account.services.privatenetwork'), instance)}</p>
<div class="card">
  ${TURN_ON_CARD_1}
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">${htmlText('account.enable.whatitdoesforyourjournal')}</div>
      <div class="gd">${htmlText('account.enable.solpbcrunsrelaysoyourjournal')}</div>
    </div>
  </div>
  <form method="post" action="/enable/spl/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    ${renderProofInputs(proof)}${instanceInput}
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">${htmlText('account.services.allow')}</button>
      <button class="btn secondary" name="action" value="cancel" type="submit">${htmlText('account.services.cancel')}</button>
    </div>
  </form>
</div>
${turnOnFooter({ paid: true, policyAnchor: 'private-network' })}`,
  });
}

export function renderEnableSplDone() {
  return enableDoneTemplate(t('account.services.privatenetwork'));
}

export function renderEnableSplNeedsSubscription() {
  return layout({
    title: t('account.services.asubscriptionisneeded'),
    body: `${brandbar()}
<div class="card" data-enable-state="needs-subscription">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${htmlText('account.services.asubscriptionisneeded')}</h2>
  <p>${htmlText('account.enable.privatenetworkneedsanactivesubscriptionbefore')}</p>
  <p>${htmlText('account.enable.ifyourjournalstoppedwaitingturnprivate')}</p>
  <a class="btn primary" href="/private-network">${htmlText('account.services.subscribe')}</a>
</div>`,
  });
}

export function renderEnableSplError(options) {
  return enableErrorTemplate(t('account.services.privatenetwork'), options);
}

export function renderEnableSpbConsent({ csrf, nonce, instance = '', proof = null }) {
  const instanceInput = instance
    ? `<input type="hidden" name="instance" value="${escAttr(instance)}">`
    : '';
  return layout({
    title: t('account.enable.turnonencryptedbackup'),
    body: `${brandbar()}
<h1>${htmlText('account.services.turnonencryptedbackup')}</h1>
<p class="lead">${turnOnLead(t('account.services.encryptedbackup'), instance)}</p>
<div class="card">
  ${TURN_ON_CARD_1}
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">${htmlText('account.enable.whatleavesyourdevice')}</div>
      <div class="gd">${htmlText('account.enable.solpbckeepscopyyourjournalencrypted')}</div>
    </div>
  </div>
  <form method="post" action="/enable/backup/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    ${renderProofInputs(proof)}${instanceInput}
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">${htmlText('account.services.allow')}</button>
      <button class="btn secondary" name="action" value="cancel" type="submit">${htmlText('account.services.cancel')}</button>
    </div>
  </form>
</div>
${turnOnFooter({ paid: true, policyAnchor: 'encrypted-backup' })}`,
  });
}

export function renderEnableSpbDone() {
  return enableDoneTemplate(t('account.services.encryptedbackup'));
}

export function renderEnableSpbNeedsSubscription() {
  return enableNeedsSubscriptionTemplate({ service: t('account.services.encryptedbackup'), href: '/services/backup' });
}

export function renderEnableSpbRestoreConsent({ csrf, nonce, candidates, error = false }) {
  const several = candidates.length > 1;
  const candidateRows = several
    ? candidates.map((candidate) => `<label class="row" style="cursor:pointer">
  <input type="radio" name="selected_instance" value="${escAttr(candidate.instanceId)}">
  <span>${restoreCandidateLines(candidate)}</span>
</label>`).join('\n')
    : `<p>${restoreCandidateLines(candidates[0])}</p>`;
  const selectedInput = several
    ? ''
    : `<input type="hidden" name="selected_instance" value="${escAttr(candidates[0].instanceId)}">`;
  const lead = several
    ? t('account.enable.solpbcreceivedrestorerequestforyour')
    : t('account.enable.solpbcreceivedrestorerequestforyour2');
  return layout({
    title: t('account.enable.restorefromencryptedbackup'),
    body: `${brandbar()}
<h1>${htmlText('account.services.restorefromencryptedbackup')}</h1>
<p class="lead">${lead}</p>
<div class="card">
  <form method="post" action="/enable/backup/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    <input type="hidden" name="intent" value="restore">
    ${selectedInput}
    <div class="group">${candidateRows}</div>
    ${several && error ? '<p class="notice">' + htmlText('account.enable.nothingisselectedyet') + '</p>' : ''}
    <p class="notice">${htmlText('account.enable.onlyonejournalattimecanback')}</p>
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">${htmlText('account.services.restore')}</button>
      <button class="btn secondary" name="action" value="cancel" type="submit">${htmlText('account.services.cancel')}</button>
    </div>
  </form>
</div>
${restorePolicyFooter('encrypted-backup')}`,
  });
}

export function renderEnableSpbRestoreNoHostedBackup() {
  return layout({
    title: t('account.enable.solpbcisntholdinganencrypted'),
    body: `${brandbar()}
<div class="card">
  <h2>${htmlText('account.enable.solpbcisntholdinganencrypted')}</h2>
  <p>${htmlText('account.enable.ifyouhavemorethanoneway')}</p>
</div>`,
  });
}

export function renderEnableSpbRestoreExpired({ date }) {
  return layout({
    title: t('account.enable.solpbcdeletedanencryptedcopy'),
    body: `${brandbar()}
<div class="card">
  <h2>${htmlText('account.enable.solpbcdeletedanencryptedcopy')}</h2>
  <p>${htmlText('account.services.on')} ${esc(date)}${htmlText('account.services.solpbcdeletedthatcopy')}</p>
</div>`,
  });
}

export function renderEnableSpbRestoreNeedsSubscription() {
  return layout({
    title: t('account.enable.encryptedbackupisoff'),
    body: `${brandbar()}
<div class="card">
  <h2>${htmlText('account.enable.encryptedbackupisoff')}</h2>
  <p>${htmlText('account.enable.solpbcisstillholdinganencrypted')}</p>
  <a class="btn primary" href="/services/backup?intent=restore">${htmlText('account.enable.turnencryptedbackupbackon')}</a>
</div>`,
  });
}

export function renderEnableSpbError(options) {
  return enableErrorTemplate(t('account.services.encryptedbackup'), options);
}

export function renderEnableSppConsent({ csrf, nonce, instance = '', onSale = false, proof = null }) {
  const instanceInput = instance
    ? `<input type="hidden" name="instance" value="${escAttr(instance)}">`
    : '';
  return layout({
    title: t('account.enable.turnonconfidentialprocessing'),
    body: `${brandbar()}
<h1>${htmlText('account.services.turnonconfidentialprocessing')}</h1>
<p class="lead">${turnOnLead(t('account.services.confidentialprocessing'), instance)}</p>
<div class="card">
  ${TURN_ON_CARD_1}
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">${htmlText('account.enable.whatleavesyourdevice')}</div>
      <div class="gd">${htmlText('account.services.whenconfidentialprocessingison')} <a href="/confidential-processing/data">${htmlText('account.services.thetextandimagesthatgotoamodelforprocessing')}</a> ${htmlText('account.services.leaveyourdevicewhentheaudioswitchisonitsdefaul')}</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">3</div>
    <div>
      <div class="gt">${htmlText('account.enable.yourjournalmustverifybeforeitsends')}</div>
      <div class="gd">${htmlText('account.enable.beforeanythingissentyourjournalchecks')}</div>
    </div>
  </div>
  <form method="post" action="/enable/spp/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    ${renderProofInputs(proof)}${instanceInput}
    ${ackField(t('account.enable.iunderstandwhatthissendsandthat'))}
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">${htmlText('account.services.allow')}</button>
      <button class="btn secondary" name="action" value="cancel" type="submit" formnovalidate>${htmlText('account.services.cancel')}</button>
    </div>
  </form>
</div>
${turnOnFooter({ paid: onSale, policyAnchor: 'confidential-processing' })}`,
  });
}

export function renderEnableSppApprovalRequired() {
  return layout({
    title: t('account.enable.scoutapprovalrequired'),
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${htmlText('account.enable.scoutapprovalrequired')}</h2>
  <p>${htmlText('account.enable.confidentialprocessingsendsyourthinkingoffyour')}</p>
  <p>${htmlText('account.enable.confidentialprocessingisavailableapprovedscoutsyou')}</p>
  <a class="btn primary" href="/scout">${htmlText('account.enable.requestscoutaccess')}</a>
</div>`,
  });
}

// Confidential processing waits for the subscription where solstone.me does not: a journal still
// waiting on this turn-on finishes it by itself once the subscription is active.
export function renderEnableSppNeedsSubscription() {
  return layout({
    title: t('account.services.asubscriptionisneeded'),
    body: `${brandbar()}
<div class="card" data-enable-state="needs-subscription">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${htmlText('account.services.asubscriptionisneeded')}</h2>
  <p>${htmlText('account.enable.confidentialprocessingneedsanactivesubscriptionbef')}</p>
  <p>${htmlText('account.enable.ifyourjournalstoppedwaitingturnconfidential')}</p>
  <a class="btn primary" href="${escAttr(SPP_SERVICE_PATH)}">${htmlText('account.services.subscribe')}</a>
</div>`,
  });
}

export function renderEnableSppJournalLimit() {
  return layout({
    title: t('account.enable.yoursubscriptioncoversanotherjournal'),
    body: `${brandbar()}
<div class="card" data-enable-state="journal-limit">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${htmlText('account.enable.yoursubscriptioncoversanotherjournal')}</h2>
  <p>${htmlText('account.enable.onesubscriptioncoversonejournalandyours')}</p>
  <p>${htmlText('account.enable.moveyoursubscriptionthisjournalreleaseother')}</p>
  <a class="btn secondary" href="${escAttr(SPP_SERVICE_PATH)}">${htmlText('account.enable.seeyoursubscription')}</a>
</div>`,
  });
}

export function renderEnableSppDone() {
  return enableDoneTemplate(t('account.services.confidentialprocessing'));
}

export function renderEnableSppError(options) {
  return enableErrorTemplate(t('account.services.confidentialprocessing'), options);
}

// The disclosure that must reach an owner before any subscription is taken, and again where
// they turn the service on. One string, used by three surfaces (this consent card,
// renderServicesSme and renderSmeLanding), so they cannot drift apart. Calmed 2026-09-21
// with operator approval: the certificate-log mechanics are not owner education. The floor is the privacy policy's
// own sentence: the address's existence stays public for good, which stays below.
export const SME_PERMANENCE_PARTS = [
  t('account.portal.addressispubliconceitsissued'),
];

export function renderEnableSmeConsent({ csrf, nonce, instance, proof = null }) {
  return layout({
    title: t('account.enable.turnonsolstoneme'),
    body: `${brandbar()}
<h1>${htmlText('account.services.turnonsolstoneme')}</h1>
<p class="lead">${turnOnLead('solstone.me', instance)}</p>
<div class="card">
  ${TURN_ON_CARD_1}
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">${htmlText('account.enable.whatanagentgets')}</div>
      <div class="gd">${htmlText('account.enable.youchoosewhatitmayseeyour')}</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">3</div>
    <div>
      <div class="gt">${htmlText('account.enable.relaycantreadwhatpassesthrough')}</div>
      <div class="gd">${htmlText('account.services.yourjournalgetsanaddressontheinternetanagentsr')} <a href="https://solpbc.org/privacy#solstone-me">${htmlText('account.services.privacypolicy')}</a>.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">4</div>
    <div>
      <div class="gt">${htmlText('account.enable.publicrecordispermanent')}</div>
      ${SME_PERMANENCE_PARTS.map((part, i) => `<div class="gd"${i ? ' style="margin-top:8px"' : ''}>${esc(part)}</div>`).join('')}
      <div class="gd" style="margin-top:8px">${htmlText('account.enable.turningthisoffkeepsaddressturningit')}</div>
    </div>
  </div>
  <form method="post" action="/enable/solstone-me/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    <input type="hidden" name="instance" value="${escAttr(instance)}">
    ${renderProofInputs(proof)}${ackField(t('account.enable.iunderstandthatpublicrecordthisaddress'))}
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">${htmlText('account.services.allow')}</button>
      <button class="btn secondary" name="action" value="cancel" type="submit" formnovalidate>${htmlText('account.services.cancel')}</button>
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

export function renderEnableSmeError(options) {
  return enableErrorTemplate('solstone.me', options);
}

// === services surfaces ===

export function renderServicesCatalog({ signedIn, welcome = false, menu = {}, networkActive = false, backupActive = false, sppActive = false, smeOnSale = false, smeActive = false, sppOnSale = false } = {}) {
  if (!signedIn) {
    return layout({
      title: t('account.services.solstoneservices2'),
      body: `${brandbarSignin()}
<h1>${htmlText('account.services.solstoneservices2')}</h1>
${BRANDLOCK}
<p class="intro"><strong>${htmlText('account.services.thesolstoneapprunsonyourdevicesandyourjournall')}</strong> ${htmlText('account.services.thesearetheoptionalpartssolpbcrunsforyouturnon')}</p>
<div class="group">
  ${row('/private-network', IC_NET, t('account.services.privatenetwork'), t('account.services.reachyourjournalfromyourphonefrom'), '<span class="price">$20<span class="per">' + htmlText('account.services.yr') + '</span></span>')}
  ${row('/backup', IC_BACKUP, t('account.services.encryptedbackup'), t('account.services.keepanencryptedcopyyourjournalsomewhere'), '<span class="price">$48<span class="per">' + htmlText('account.services.yr') + '</span></span>')}
  ${smeOnSale ? row('/solstone-me', IC_GLOBE, 'solstone.me', t('account.services.anaddressforyourjournalsoan'), '<span class="price">$5<span class="per">' + htmlText('account.services.yr') + '</span></span>') : ''}
  ${row('/notifications', IC_PUSH_SVG, t('account.services.notifications'), t('account.services.notificationsreachyouwhentheressomething'), '<span class="tag builtin">' + htmlText('account.services.builtin') + '</span>')}
  ${sppOnSale
    ? row(SPP_SERVICE_PATH, IC_CHIP, t('account.services.confidentialprocessing'), t('account.services.thinkoffyourdeviceonconfidentialhardware'), '<span class="price">$96<span class="per">' + htmlText('account.services.yr') + '</span></span>')
    : row('/confidential-processing', IC_CHIP, t('account.services.confidentialprocessing'), t('account.services.availableapprovedscoutsthinkoffyourdevice'), '<span class="tag free">' + htmlText('account.services.scouts') + '</span>')}
  ${row('/scout', IC_SCOUT_SVG, t('account.services.scout'), sppOnSale ? t('account.services.testerprogramconfidentialprocessingiscomplimentary') : t('account.services.testerprogramapprovedscoutscanenableconfidential'), '<span class="tag free">' + htmlText('account.services.program') + '</span>')}
</div>
  <p class="disclosure">${htmlText('account.services.noanalyticsandnotrackingsignin')}</p>`,
    });
  }

  const notice = menu.decryptOk === false
    ? `<p class="notice">${htmlText('account.services.wecouldntdecryptyouremailaddress')}</p>`
    : '';
  const networkPill = pill(networkActive ? 'on' : 'off', networkActive ? t('account.services.on') : t('account.services.off'));
  const backupPill = pill(backupActive ? 'on' : 'off', backupActive ? t('account.services.on') : t('account.services.off'));
  const notifPill = pill('on', t('account.services.on'));
  const sppPill = sppOnSale
    ? pill(sppActive ? 'on' : 'off', sppActive ? t('account.services.covered') : t('account.services.notcovered'))
    : pill(sppActive ? 'on' : 'off', sppActive ? t('account.services.available') : t('account.services.notavailable'));
  const smePill = pill(smeActive ? 'on' : 'off', smeActive ? t('account.services.covered') : t('account.services.notcovered'));
  const welcomePanel = welcome
    ? `<div class="card" style="margin-bottom:24px">
  <h2>${htmlText('account.services.setuppasskeyfornexttime')}</h2>
  <p>${htmlText('account.services.useyourdevicesigninwithouttyping')}</p>
  <label for="passkey-friendly-name">${htmlText('account.passkey.devicename')}</label>
  <input id="passkey-friendly-name" type="text" maxlength="64" placeholder="${attrText('account.passkey.devicenameoptional')}" autocomplete="off">
  <div class="btn-row">
    <button id="passkey-add" class="btn primary" type="button">${htmlText('account.passkey.addpasskey')}</button>
    <button id="passkey-skip" class="btn secondary" type="button">${htmlText('account.services.notnow')}</button>
  </div>
  <div id="passkey-enroll-error" class="error" hidden></div>
</div>`
    : '';
  return layout({
    title: t('account.services.yourservices'),
    body: `${topbar(menu)}
<h1>${htmlText('account.services.yourservices')}</h1>
${notice}
${BRANDLOCK}
<p class="intro"><strong>${htmlText('account.services.thesolstoneapprunsonyourdevicesandyourjournall')}</strong> ${htmlText('account.services.theseservicesareoptionalturnthemonwhentheyhelp')}</p>
${welcomePanel}
<div class="group">
  ${row('/private-network', IC_NET, t('account.services.privatenetwork'), t('account.services.yourprivatenetworkreachyourjournalfrom'), networkPill)}
  ${row('/services/backup', IC_BACKUP, t('account.services.encryptedbackup'), t('account.services.anencryptedcopyonlyyoucanread'), backupPill)}
  ${smeOnSale ? row(SME_SERVICE_PATH, IC_GLOBE, 'solstone.me', t('account.services.anaddressforyourjournalsoan'), smePill) : ''}
  ${row('/notifications', IC_PUSH_SVG, t('account.services.notifications'), t('account.services.notificationsarebuiltintoappturnthem'), notifPill)}
  ${row('/confidential-processing', IC_CHIP, t('account.services.confidentialprocessing'), t('account.services.confidentialprocessingoffyourdeviceonconfidential'), sppPill)}
  ${row('/scout', IC_SCOUT_SVG, t('account.services.scout'), sppOnSale ? t('account.services.testerprogramconfidentialprocessingiscomplimentary') : t('account.services.testerprogramapprovedscoutscanenableconfidential'), '<span class="tag free">' + htmlText('account.services.program') + '</span>')}
</div>
<div class="group" style="margin-top:22px">
  ${row('/sign-in', IC_SESSION_SVG, t('account.deletion.yoursignin'), t('account.services.sessionspasskeysandemailaddresses'), '')}
  ${row('/billing', IC_BILLING_SVG, t('account.services.billing'), t('account.services.whatyoupayforandwhenit'), '')}
  ${row('/transparency', IC_EMPTY_DATA_SVG, t('account.services.datatransparency'), menu.exportEnabled ? t('account.services.whatsolpbcholdsforyoursign') : t('account.services.whatsolpbcholdsforyoursign2'), '')}
</div>`,
    afterMain: welcome ? `<script>${ENROLL_JS}</script>` : '',
  });
}

export function renderPrivateNetworkLanding() {
  return layout({
    title: t('account.services.privatenetwork'),
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} ${htmlText('account.services.services')}</a>
<h1>${htmlText('account.services.privatenetwork')}</h1>
<p class="hero-tag">${htmlText('account.billing.yourprivatenetwork')}</p>
<p class="lead">${htmlText('account.services.reachyourjournalfromyourphoneyour')}</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_NET, t('account.services.yourownnetworkalwaysfree'), t('account.services.onsamewifioroveryourown'))}
  ${beat(IC_GLOBE, t('account.services.yourprivatenetworkfromanywhere'), t('account.services.solpbcrunsblindrelaysoyour2'))}
  ${beat(IC_VAULT, t('account.services.blindbyconstruction'), "" + htmlText('account.services.therelaypassesalongencryptedbytesitcantreadsol') + " <strong>" + htmlText('account.services.cannotseeyourtraffic') + "</strong>" + htmlText('account.services.theresnokeytorevealbydesignnotbypromise') + "")}
</div>
<div class="card">
  <div class="pricecard">
    <div><div class="big">$20 <span class="price"><span class="per">${htmlText('account.services.year')}</span></span></div><div class="alt">${htmlText('account.services.or249monthtaxincludedper')}</div></div>
    <a class="btn primary" href="/?signin">${htmlText('account.services.signinenable')}</a>
  </div>
  <p class="free-note" style="margin:14px 0 0">${htmlText('account.services.youneverhavepayusonyour')}</p>
</div>
<p class="disclosure">${htmlText('account.services.opensource')} <a href="/terms">${htmlText('account.services.terms2')}</a></p>`,
  });
}

export function renderBackupLanding() {
  return layout({
    title: t('account.services.encryptedbackup'),
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} ${htmlText('account.services.services')}</a>
<h1>${htmlText('account.services.encryptedbackup')}</h1>
<p class="lead">${htmlText('account.services.keepanencryptedcopyyourjournalsomewhere2')}</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_BACKUP, t('account.services.yourownbucketalwaysfree'), t('account.services.pointsolstoneatyourownstoragebackblaze'))}
  ${beat(IC_GLOBE, t('account.services.operatedbysolpbc48year'), t('account.services.rathernotrunbucketletsolpbc'))}
  ${beat(IC_VAULT, t('account.services.encryptedbeforeitleaves'), t('account.services.yourjournalisencryptedonyourdevice'))}
</div>
<div class="card">
  <div class="pricecard">
    <div><div class="big">$48 <span class="price"><span class="per">${htmlText('account.services.year')}</span></span></div><div class="alt">${htmlText('account.services.or499monthtaxincludedoperated')}</div></div>
    <a class="btn primary" href="/?signin">${htmlText('account.services.signinenable')}</a>
  </div>
  <p class="free-note" style="margin:14px 0 0">${htmlText('account.services.youneverhavepayusbringyour')}</p>
</div>
<p class="disclosure">${htmlText('account.services.opensourceselfhostable')} <a href="/terms">${htmlText('account.services.terms2')}</a></p>`,
  });
}

export function renderNotificationsLanding() {
  return layout({
    title: t('account.services.notifications'),
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} ${htmlText('account.services.services')}</a>
<h1>${htmlText('account.services.notifications')}</h1>
<p class="hero-tag">${htmlText('account.services.builtin')}</p>
<p class="lead">${htmlText('account.services.notificationsreachyouonyourdeviceswhen')}</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_PUSH_SVG, t('account.services.builtintosolstone'), t('account.services.notificationscomewithsolstonefreewithno'))}
  ${beat(IC_GLOBE, t('account.services.onyourdevices'), t('account.services.yougetshortheadsuponyour'))}
  ${beat(IC_VAULT, t('account.services.nottrackingsurface'), t('account.services.noanalyticsnobehavioralprofilingandno'))}
</div>
<div class="card">
  <div class="statusline"><span class="tag builtin">${htmlText('account.services.builtin')}</span> <span>${htmlText('account.services.turnonnotificationsoneachdeviceyouwanttohearfr')}</span></div>
</div>
<p class="disclosure"><a href="/terms">${htmlText('account.services.terms2')}</a></p>`,
  });
}

export function renderConfidentialProcessingLanding({ onSale = false } = {}) {
  const offer = onSale
    ? `<div class="card">
  <div class="pricecard">
    <div><div class="big">$96 <span class="price"><span class="per">${htmlText('account.services.year')}</span></span></div><div class="alt">${htmlText('account.services.or999monthtaxincludedper')}</div><div class="alt">${esc(SPP_SIZE)}</div></div>
    <a class="btn primary" href="/?signin">${htmlText('account.services.signinenable')}</a>
  </div>
  <p class="free-note" style="margin:14px 0 0">${esc(SPP_NEVER_PAY)}</p>
</div>`
    : `<div class="card">
  <div class="statusline"><span class="tag free">${htmlText('account.services.availabletoapprovedscouts')}</span><span>${htmlText('account.services.confidentialprocessingisavailableapprovedscoutsena')}</span></div>
</div>`;
  return layout({
    title: t('account.services.confidentialprocessing'),
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} ${htmlText('account.services.services')}</a>
<h1>${htmlText('account.services.confidentialprocessing')}</h1>
<p class="lead">${htmlText('account.services.confidentialprocessingsends')} <a href="/confidential-processing/data">${htmlText('account.services.yourthinkingoffyourdevice')}</a>${htmlText('account.services.neveryourjournalwhichstaysonthedeviceitrunsoni')}</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_CHIP, t('account.services.onhardwaresolpbcruns'), t('account.services.thinkoffyourdeviceonconfidentialhardware'))}
  ${beat(IC_VAULT, t('account.services.solpbcsownmodel'), t('account.services.modelsolpbcrunsitselfwithno'))}
  ${beat(IC_EMPTY_DATA_SVG, t('account.services.keptfornothing'), t('account.services.nocontentisretainednohumanreviews'))}
  ${beat(IC_GLOBE, t('account.services.yourjournaldoeschecking'), t('account.services.yourjournalmustverifyservicebeforeanything'))}
</div>
${offer}
<p class="disclosure"><a href="/terms">${htmlText('account.services.terms2')}</a></p>`,
  });
}

export function renderConfidentialProcessingData() {
  const title = t('account.portal.confidentialprocessing');
  return layout({
    title,
    body: `${brandbar()}
<h1>${esc(title)}</h1>
<h2>${htmlText('account.portal.whatleavesyourdevice')}</h2>
<p>${htmlText('account.services.textandimagesthatgomodelfor')}</p>
<h2>${htmlText('account.services.whatdoesnt')}</h2>
<p>${htmlText('account.services.yourjournalstaysondeviceitruns')}</p>
<h2>${htmlText('account.portal.audio')}</h2>
<p>${htmlText('account.services.whenconfidentialprocessingisonandaudio')}</p>
<p>${htmlText('account.services.serviceturnsspeechtextinmemoryon')}</p>
<p>${htmlText('account.services.ifyourjournalcantverifyservice')}</p>
<p>${htmlText('account.services.transcribeaudioonserviceswitchlivesin')}</p>
<p>${htmlText('account.services.modelissameeitherwayparakeettdt')}</p>
<p>${htmlText('account.portal.speechtotextisservedwithparakeettdt06bv3create')} <a href="https://creativecommons.org/licenses/by/4.0/">${htmlText('account.portal.ccby40')}</a>.</p>
<h2>${htmlText('account.portal.whereitgoes')}</h2>
<p>${htmlText('account.services.modelsolpbcrunsitselfnothird')}</p>
<h2>${htmlText('account.services.hardware')}</h2>
<p>${htmlText('account.services.confidentialgpusinmicrosoftazurethatsol')}</p>
<h2>${htmlText('account.services.whatskept')}</h2>
<p>${htmlText('account.services.nocontentisretainednohumanreviews2')}</p>
<h2>${htmlText('account.services.check')}</h2>
<p>${htmlText('account.services.yourjournalmustverifyservicebeforeanything3')}</p>
<h2>${htmlText('account.services.yourchoice')}</h2>
<p>${htmlText('account.services.offuntilyouturnitonturn')}</p>
<h2>${htmlText('account.services.covenants')}</h2>
<p>${htmlText('account.portal.thecovenants')} <a href="/terms">${htmlText('account.portal.terms')}</a> · <a href="https://solpbc.org/privacy">${htmlText('account.portal.privacy')}</a></p>`,
  });
}

export function renderScoutLanding({ sppOnSale = false } = {}) {
  const lead = sppOnSale
    ? t('account.services.scoutistesterprogramapprovedscoutsget')
    : t('account.services.scoutistesterprogramapprovedscoutscan');
  const benefit = sppOnSale
    ? t('account.services.complimentaryforapprovedscoutsturniton')
    : t('account.scout.confidentialprocessingisavailabletoapprovedsco');
  return layout({
    title: t('account.scout.scout'),
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} ${htmlText('account.scout.services')}</a>
<h1>${htmlText('account.scout.scout')}</h1>
<p class="lead">${esc(lead)}</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_CHIP, t('account.scout.confidentialprocessing'), esc(benefit))}
  ${beat(IC_NET, t('account.scout.yourjournaldoesthechecking'), t('account.scout.yourjournalmustverifytheservicebeforeanythingi'))}
  ${beat(IC_SCOUT_SVG, t('account.scout.keptfornothing'), t('account.scout.nocontentisretainednohumanreviewsitnothingisus'))}
  ${beat(IC_GLOBE, t('account.services.helpshapesolstone'), t('account.scout.sharefeedbackthroughsupportandfollowwhatschang'))}
</div>
<div class="card">
  <div class="pricecard">
    <div><div class="big" style="font-size:1.15rem">${htmlText('account.scout.free')} <span class="price"><span class="per">${htmlText('account.scout.testerprogram')}</span></span></div></div>
    <a class="btn primary" href="/?signin">${htmlText('account.services.requestscout')}</a>
  </div>
  <p class="free-note" style="margin:14px 0 0">${SCOUT_PROGRAM_COVENANT}</p>
</div>
<p class="disclosure"><a href="/terms">${htmlText('account.scout.terms')}</a></p>`,
  });
}

export function renderSmeLanding() {
  return layout({
    title: 'solstone.me',
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} ${htmlText('account.services.services')}</a>
<h1>solstone.me</h1>
<p class="lead">${htmlText('account.services.anaddressoninternetforyourjournal2')}</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_GLOBE, t('account.services.anaddressforyourjournal'), t('account.services.solpbcrunssolstonemerelayin'))}
  ${beat(IC_VAULT, t('account.services.blindbyconstruction'), t('account.services.yourownmachineholdsprivatekeyand'))}
  ${beat(IC_NET, t('account.services.whatanagentgets'), t('account.services.youchoosewhatitmayseeyourwholejournaloronlythe'))}
  ${beat(IC_GLOBE, t('account.services.whereyoumanageit'), t('account.services.yourjournalsagentsappworkswith'))}
</div>
<div class="card">
  <h2>${htmlText('account.services.thepublicrecordispermanent')}</h2>
  ${SME_PERMANENCE_PARTS.map((part) => `<p>${esc(part)}</p>`).join('\n  ')}
</div>
<div class="card">
  <div class="pricecard">
    <div><div class="big">$5 <span class="price"><span class="per">${htmlText('account.services.year')}</span></span></div><div class="alt">${htmlText('account.services.annualonlytaxincludedperjournalnot')}</div></div>
    <a class="btn primary" href="/?signin">${htmlText('account.services.signinenable')}</a>
  </div>
  <p class="free-note" style="margin:14px 0 0">${htmlText('account.services.youneverhavepayusyourjournal')}</p>
</div>
<div class="card">
  <h2>${htmlText('account.services.oruseyourowndomain')}</h2>
  <p>${htmlText('account.services.freefromusyourjournalwalksyou')}</p>
</div>
<p class="disclosure"><a href="/terms">${htmlText('account.services.terms2')}</a></p>`,
  });
}

export function renderServicesSpl({ entitlement, plan = null, withdrawal = null, startNowBox = false, keyInfo = false, cancelContract = '', cancelOffered = false, csrf, flash = {}, menu }) {
  const flashes = billingFlashMessages(flash) + withdrawalFlashMessages(flash, t('account.services.privatenetwork2'));
  const status = entitlement?.status || '';
  const paidThrough = formatUnixSecondsDate(entitlement?.current_period_end);
  const cancelPending = Boolean(entitlement?.cancel_at_period_end);
  const detailParts = [];
  if (entitlement?.enabled_at != null) detailParts.push(t('account.services.enabled2', { date: formatDate(entitlement.enabled_at) }));
  const statusDetail = detailParts.join(' · ');
  const onStatusLine = '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>' + htmlText('account.services.on2') + '</span> ' + htmlText('account.services.nbspyourprivatenetworkison') + '';
  const controlGroup = `<div class="group">
  <div class="row" style="cursor:default">${IC_NET}<div class="body"><div class="title">${htmlText('account.services.yourprivatenetwork')}</div><div class="desc">${esc(statusDetail)}</div></div></div>
</div>`;
  const page = ({ statusLine = '', content }) => layout({
    title: t('account.services.privatenetwork2'),
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} ${htmlText('account.services.yourservices2')}</a>
${flashes}
<div class="pagehead">
  <h1>${htmlText('account.services.privatenetwork2')}</h1>
  ${statusLine ? `<p class="signed-in">${statusLine}</p>` : ''}
</div>
${content}${cancelContractLink(cancelOffered ? cancelContract : '', withdrawal, t('account.services.privatenetwork2'))}`,
  });
  const turnOff = cancelContract || cancelPending ? '' : billingPortalForm({ csrf, buttonText: t('account.services.turnoff'), buttonClass: 'btn danger', action: '/billing/cancel' });

  if (entitlement?.source === 'comp' && status === 'active') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
<p class="disclosure" style="margin-top:24px">${htmlText('account.services.freewhileyoureanapprovedscoutonyourownnetworks')} <a href="/private-network?learn">${htmlText('account.services.howitworks')}</a> · <a href="/terms">${htmlText('account.services.terms3')}</a></p>`,
    });
  }

  if (status === 'active') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
${cancelPending ? `<p class="notice">${htmlText('account.services.scheduledtoturnoffon')} ${esc(paidThrough)}.${keepItOn(cancelContract, t('account.services.managebillingtokeepiton'))}</p>` : ''}
<div class="btn-row" style="margin-top:16px">
  ${billingPortalForm({ csrf })}
  ${turnOff}
</div>
${withdrawalDoor(withdrawal)}
<p class="disclosure" style="margin-top:24px">${renewalLead({ paidThrough, cancelPending, plan })}${htmlText('account.services.billedthroughstripeonyourownnetworksamewifiory')} <a href="/private-network?learn">${htmlText('account.services.howitworks')}</a> · <a href="/terms">${htmlText('account.services.terms3')}</a></p>`,
    });
  }

  if (status === 'past_due') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
<p class="notice">${htmlText('account.services.yourlastpaymentdidntgothrough4')}</p>
${cancelPending ? `<p class="notice">${htmlText('account.services.scheduledtoturnoffon')} ${esc(paidThrough)}.${keepItOn(cancelContract, t('account.services.managebillingtokeepiton'))}</p>` : ''}
<div class="btn-row" style="margin-top:16px">
  ${billingPortalForm({ csrf })}
  ${turnOff}
</div>
${withdrawalDoor(withdrawal)}
<p class="disclosure" style="margin-top:24px">${htmlText('account.services.billedthroughstripeonyourownnetworksamewifiory')} <a href="/private-network?learn">${htmlText('account.services.howitworks')}</a> · <a href="/terms">${htmlText('account.services.terms3')}</a></p>`,
    });
  }

  return page({
    content: `<p class="lead">${htmlText('account.services.solpbcrunsblindrelaysoyour')}</p>
<div class="card">
  <p>${htmlText('account.services.youneverhavetopayusonyourownnetworksamewifiory')}</p>
  ${checkoutGroup({ csrf, service: t('account.services.privatenetwork2'), startNowBox, keyInfo, rows: [
    { plan: 'annual', unitAmount: 2000, buttonText: t('account.services.payyearly'), primary: true },
    { plan: 'monthly', unitAmount: 249, buttonText: t('account.services.paymonthly'), primary: false },
  ] })}
  <p class="disclosure">${htmlText('account.services.taxincludedbilledsecurelythroughstripe')} <a href="/terms">${htmlText('account.services.terms3')}</a></p>
</div>`,
  });
}

export function renderServicesSpb({ entitlement, plan = null, withdrawal = null, startNowBox = false, keyInfo = false, cancelContract = '', cancelOffered = false, csrf, flash = {}, menu, restoreIntent = false, restoreCheckout = false }) {
  const flashes = spbBillingFlashMessages(flash) + withdrawalFlashMessages(flash, t('account.services.encryptedbackup3'));
  const status = entitlement?.status || '';
  const paidThrough = formatUnixSecondsDate(entitlement?.current_period_end);
  const cancelPending = Boolean(entitlement?.cancel_at_period_end);
  const detailParts = [];
  if (entitlement?.enabled_at != null) detailParts.push(t('account.services.enabled2', { date: formatDate(entitlement.enabled_at) }));
  detailParts.push(t('account.services.operatedbysolpbc'));
  const statusDetail = detailParts.join(' · ');
  const onStatusLine = '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>' + htmlText('account.services.on2') + '</span> ' + htmlText('account.services.nbspyourencryptedbackupison') + '';
  const controlGroup = `<div class="group">
  <div class="row" style="cursor:default">${IC_BACKUP}<div class="body"><div class="title">${htmlText('account.services.encryptedbackup3')}</div><div class="desc">${esc(statusDetail)}</div></div></div>
</div>`;
  const portalActions = `<div class="btn-row" style="margin-top:16px">
  ${billingPortalForm({ csrf, action: '/services/backup/portal' })}
  ${cancelContract || cancelPending ? '' : billingPortalForm({ csrf, buttonText: t('account.services.turnoff'), buttonClass: 'btn danger', action: '/services/backup/cancel' })}
</div>`;
  const cancellationNotice = cancelPending
    ? `<p class="notice">${htmlText('account.services.scheduledtoturnoffon')} ${esc(paidThrough)}.${keepItOn(cancelContract, t('account.services.managebillingtokeepiton'))}</p>`
    : '';
  const retentionDisclosure = '<p class="disclosure" style="margin-top:24px">' + htmlText('account.services.ifyouturnencryptedbackupoffsolpbckeepsyourencr') + ' <a href="/backup">' + htmlText('account.services.howitworks') + '</a> · <a href="/terms">' + htmlText('account.services.terms3') + '</a></p>';
  const page = ({ statusLine = '', content }) => layout({
    title: t('account.services.encryptedbackup3'),
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} ${htmlText('account.services.yourservices2')}</a>
${flashes}
${restoreCheckout ? '<p class="notice">' + htmlText('account.services.ifyourerestoringajournalreturntoitandstartther') + '</p>' : ''}
<div class="pagehead">
  <h1>${htmlText('account.services.encryptedbackup3')}</h1>
  <p class="meta">${htmlText('account.services.operatedbysolpbc')}</p>
  ${statusLine ? `<p class="signed-in">${statusLine}</p>` : ''}
</div>
${content}${cancelContractLink(cancelOffered ? cancelContract : '', withdrawal, t('account.services.encryptedbackup3'))}`,
  });

  if (entitlement?.source === 'comp' && status === 'active') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
<p class="disclosure" style="margin-top:24px">${htmlText('account.services.freewhileyoureanapprovedscout2')} <a href="/backup">${htmlText('account.services.howitworks')}</a> · <a href="/terms">${htmlText('account.services.terms3')}</a></p>`,
    });
  }

  if (status === 'active') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
${cancellationNotice}
${portalActions}
${withdrawalDoor(withdrawal)}
${retentionDisclosure}
<p class="disclosure" style="margin-top:24px">${renewalLead({ paidThrough, cancelPending, plan })}${htmlText('account.services.billedthroughstripe')} <a href="/backup">${htmlText('account.services.howitworks')}</a> · <a href="/terms">${htmlText('account.services.terms3')}</a></p>`,
    });
  }

  if (status === 'past_due') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
<p class="notice">${htmlText('account.services.yourlastpaymentdidntgothrough3')}</p>
${cancellationNotice}
${portalActions}
${withdrawalDoor(withdrawal)}
${retentionDisclosure}
<p class="disclosure" style="margin-top:24px">${htmlText('account.services.billedthroughstripe')} <a href="/backup">${htmlText('account.services.howitworks')}</a> · <a href="/terms">${htmlText('account.services.terms3')}</a></p>`,
    });
  }

  return page({
    content: `<p class="lead">${htmlText('account.services.solpbckeepsanencryptedcopyyour')}</p>
<div class="card">
  <p>${htmlText('account.services.turnonencryptedbackup2')}</p>
  ${checkoutGroup({ csrf, service: t('account.services.encryptedbackup3'), startNowBox, keyInfo, action: '/services/backup/checkout', restoreIntent, rows: [
    { plan: 'annual', unitAmount: 4800, buttonText: t('account.services.payyearly'), primary: true },
    { plan: 'monthly', unitAmount: 499, buttonText: t('account.services.paymonthly'), primary: false },
  ] })}
  <p class="disclosure">${htmlText('account.services.taxincludedbilledsecurelythroughstripebypaying')} <a href="/terms">${htmlText('account.services.terms3')}</a>.</p>
</div>
${restoreCheckout ? '' : retentionDisclosure}`,
  });
}

export const SME_JOURNAL_UPDATE_NOTICE = t('account.portal.yourjournalneedsanupdatebeforeit');

// solstone.me is sold yearly only, from its own form.
const SME_PLAN = { plan: 'annual', unitAmount: 500 };

export function renderServicesSme({ entitlement, plan = null, withdrawal = null, startNowBox = false, keyInfo = false, cancelContract = '', cancelOffered = false, csrf, flash = {}, menu, journalUpdateNotice = false }) {
  const flashes = smeBillingFlashMessages(flash) + withdrawalFlashMessages(flash, 'solstone.me');
  const updateNotice = journalUpdateNotice
    ? `<p class="notice" data-notice="sme-journal-update">${esc(SME_JOURNAL_UPDATE_NOTICE)}</p>`
    : '';
  const status = entitlement?.status || '';
  const paidThrough = formatUnixSecondsDate(entitlement?.current_period_end);
  const cancelPending = Boolean(entitlement?.cancel_at_period_end);
  const detailParts = [];
  if (entitlement?.enabled_at != null) detailParts.push(t('account.services.coveredsince2', { date: formatDate(entitlement.enabled_at) }));
  detailParts.push(t('account.services.operatedbysolpbc'), t('account.services.turnitonfromyourjournal'));
  const coveredPill = '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>' + htmlText('account.services.covered2') + '</span>';
  const controlGroup = `<div class="group">
  <div class="row" style="cursor:default">${IC_GLOBE}<div class="body"><div class="title">solstone.me</div><div class="desc">${esc(detailParts.join(' · '))}</div></div></div>
</div>`;
  const portalActions = `<div class="btn-row" style="margin-top:16px">
  ${billingPortalForm({ csrf, action: `${SME_SERVICE_PATH}/portal` })}
  ${cancelContract || cancelPending ? '' : billingPortalForm({ csrf, buttonText: t('account.services.cancelsolstoneme'), buttonClass: 'btn danger', action: `${SME_SERVICE_PATH}/cancel` })}
</div>`;
  const cancellationNotice = cancelPending
    ? `<p class="notice">${htmlText('account.services.yoursolstonemecoverageisscheduledtoendon')} ${esc(paidThrough)}.${keepItOn(cancelContract, t('account.services.managebillingtokeepit'))}</p>`
    : '';
  const page = ({ statusLine = '', content }) => layout({
    title: 'solstone.me',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} ${htmlText('account.services.yourservices2')}</a>
${flashes}
${updateNotice}
<div class="pagehead">
  <h1>solstone.me</h1>
  <p class="meta">${htmlText('account.services.operatedbysolpbc')}</p>
  ${statusLine ? `<p class="signed-in">${statusLine}</p>` : ''}
</div>
${content}${cancelContractLink(cancelOffered ? cancelContract : '', withdrawal, 'solstone.me')}`,
  });

  if (entitlement?.source === 'comp' && status === 'active') {
    return page({
      statusLine: coveredPill,
      content: `${controlGroup}
<p class="disclosure" style="margin-top:24px">${htmlText('account.services.freewhileyoureanapprovedscout2')}</p>`,
    });
  }

  if (status === 'active') {
    return page({
      statusLine: t('account.services.nbspyourpaymentisuptodate', { coveredPill }),
      content: `${controlGroup}
${cancellationNotice}
${portalActions}
${withdrawalDoor(withdrawal)}
<p class="disclosure" style="margin-top:24px">${renewalLead({ paidThrough, cancelPending, plan })}${htmlText('account.services.billedthroughstripe')}</p>`,
    });
  }

  if (status === 'past_due') {
    return page({
      statusLine: t('account.services.yourlastpaymentneedsattention'),
      content: `${controlGroup}
<p class="notice">${htmlText('account.services.yourlastpaymentdidntgothrough2')}</p>
${cancellationNotice}
${portalActions}
${withdrawalDoor(withdrawal)}
<p class="disclosure" style="margin-top:24px">${htmlText('account.services.billedthroughstripe')}</p>`,
    });
  }

  return page({
    content: `<p class="lead">${htmlText('account.services.anaddressoninternetforyourjournal')}</p>
<div class="card">
  <h2>${htmlText('account.services.thepublicrecordispermanent2')}</h2>
  ${SME_PERMANENCE_PARTS.map((part) => `<p>${esc(part)}</p>`).join('\n  ')}
</div>
<div class="card">
  <form method="post" action="${escAttr(`${SME_SERVICE_PATH}/checkout`)}">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="plan" value="annual">
    <p><strong>${esc(planTitle(SME_PLAN))}</strong></p>
    ${ackField(t('account.enable.iunderstandthatpublicrecordthisaddress'))}
    ${keyInfo ? keyInformation([SME_PLAN], 'solstone.me') : ''}${startNowBox ? startNowField() : ''}
    <div class="btn-row" style="margin-top:16px">
      <button class="btn primary" type="submit">${htmlText('account.services.payyearly')}</button>
    </div>
  </form>
  <p class="disclosure">${htmlText('account.services.taxincludedbilledsecurelythroughstripecomplime')} <a href="/terms">${htmlText('account.services.terms3')}</a>.</p>
</div>
<p class="disclosure" style="margin-top:24px"><strong>${htmlText('account.services.youneverhavetopayus')}</strong> ${htmlText('account.services.yourjournaldoesntneedsolpbctobereachableatunne')}</p>`,
  });
}

// Why no one has to pay for confidential processing: the same thinking runs on the owner's own
// machine, or with their own provider, with sol pbc out of the path.
export const SPP_NEVER_PAY = t('account.portal.youneverhavepayusyourjournal');

// What a plan is sized for, on the price card. The unit is the journal; a computer and a phone
// describe its size. The checkout card carries the plan terms, which already say it.
const SPP_SIZE = t('account.portal.sizedforonejournalwithcomputerand');

// One subscription covers one journal (terms § 3: per journal, not per device).
const SPP_ONE_JOURNAL = t('account.portal.onesubscriptioncoversonejournalturnit');

export function renderServicesSpp({
  entitlement,
  menu,
  onSale = false,
  serving = false,
  journals = [],
  plan = null,
  withdrawal = null,
  startNowBox = false,
  cancelContract = '',
  cancelOffered = false,
  keyInfo = false,
  csrf = '',
  flash = {},
  planTerms = '',
}) {
  const status = entitlement?.status || '';
  const page = ({ statusLine, content, flashes = '' }) => layout({
    title: t('account.services.confidentialprocessing2'),
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} ${htmlText('account.services.yourservices2')}</a>
${flashes}
<div class="pagehead">
  <h1>${htmlText('account.services.confidentialprocessing2')}</h1>
  ${onSale ? '<p class="meta">' + htmlText('account.services.operatedbysolpbc') + '</p>' : ''}
  ${statusLine ? `<p class="signed-in">${statusLine}</p>` : ''}
</div>
${content}${cancelContractLink(cancelOffered ? cancelContract : '', withdrawal, t('account.services.confidentialprocessing2'))}`,
  });

  if (!onSale) {
    if (status === 'active') {
      return page({
        statusLine: '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>' + htmlText('account.services.available2') + '</span> ' + htmlText('account.services.nbspconfidentialprocessingisavailabletothissig') + '',
        content: `<div class="group">
  <div class="row" style="cursor:default">${IC_CHIP}<div class="body"><div class="title">${htmlText('account.services.confidentialprocessing2')}</div><div class="desc">${htmlText('account.services.availableenablefromyourjournal')}</div></div></div>
</div>
<p class="disclosure" style="margin-top:24px">${htmlText('account.services.yourjournalmustverifytheservicebeforeanythingi')} <a href="/terms">${htmlText('account.services.terms3')}</a></p>
<p class="disclosure">${htmlText('account.services.transcribeaudioonserviceswitchlivesin2')}</p>`,
      });
    }

    return page({
      statusLine: '<span class="pill off" style="vertical-align:middle"><span class="dot"></span>' + htmlText('account.services.notavailable2') + '</span> ' + htmlText('account.services.nbspconfidentialprocessingisnotavailabletothis') + '',
      content: `<p class="lead">${htmlText('account.services.confidentialprocessingisavailabletoapprovedsco')} <a href="/scout">${htmlText('account.services.scout2')}</a> ${htmlText('account.services.torequestaccess')}</p>
<div class="card">
  ${beat(IC_EMPTY_DATA_SVG, t('account.services.keptfornothing2'), t('account.services.nocontentisretainednohumanreviews'))}
  ${beat(IC_CHIP, t('account.services.thinkingleaves'), t('account.services.confidentialprocessingsendsyourthinkingoffyour'))}
</div>
<p class="disclosure" style="margin-top:24px"><a href="/scout">${htmlText('account.services.requestscoutaccess')}</a> · <a href="/terms">${htmlText('account.services.terms3')}</a></p>`,
    });
  }

  const flashes = sppBillingFlashMessages(flash) + withdrawalFlashMessages(flash, t('account.services.confidentialprocessing2'));
  const paidThrough = formatUnixSecondsDate(entitlement?.current_period_end);
  const cancelPending = Boolean(entitlement?.cancel_at_period_end);
  const coveredPill = '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>' + htmlText('account.services.covered2') + '</span>';
  const detailParts = [];
  if (entitlement?.enabled_at != null) detailParts.push(t('account.services.coveredsince2', { date: formatDate(entitlement.enabled_at) }));
  detailParts.push(t('account.services.operatedbysolpbc'), t('account.services.turnitonfromyourjournal'));
  const controlGroup = `<div class="group">
  <div class="row" style="cursor:default">${IC_CHIP}<div class="body"><div class="title">${htmlText('account.services.confidentialprocessing2')}</div><div class="desc">${esc(detailParts.join(' · '))}</div></div></div>
</div>`;
  const portalActions = `<div class="btn-row" style="margin-top:16px">
  ${billingPortalForm({ csrf, action: `${SPP_SERVICE_PATH}/portal` })}
  ${cancelContract || cancelPending ? '' : billingPortalForm({ csrf, buttonText: t('account.services.cancelconfidentialprocessing'), buttonClass: 'btn danger', action: `${SPP_SERVICE_PATH}/cancel` })}
</div>`;
  const cancellationNotice = cancelPending
    ? `<p class="notice">${htmlText('account.services.yourconfidentialprocessingisscheduledtoendon')} ${esc(paidThrough)}.${keepItOn(cancelContract, t('account.services.managebillingtokeepit'))}</p>`
    : '';
  const howItWorks = '<a href="/confidential-processing/data">' + htmlText('account.services.whatleavesyourdevice') + '</a> · <a href="/terms">' + htmlText('account.services.terms3') + '</a>';
  // The journals the subscription covers, each with its own release, so the owner can move it.
  const journalList = journals.length
    ? `<div class="card" style="margin-top:16px">
  <p>${journals.length === 1
    ? t('account.services.yoursubscriptioncoversonejournaluseit')
    : t('account.services.yoursubscriptioncoversjournalsturnedonwhileyou', { count: journals.length })}</p>
  <div class="group">
  ${journals.map((j) => `<div class="row" style="cursor:default">${IC_CHIP}<div class="body"><div class="title">${journalIdLabel(j.instance_id)}</div><div class="desc">${htmlText('account.services.firstturnedon')} ${esc(formatDate(j.created_at))}</div></div><div class="trail"><form method="post" action="${escAttr(`${SPP_SERVICE_PATH}/release`)}">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="instance" value="${escAttr(j.instance_id)}">
    <button class="btn secondary" type="submit">${htmlText('account.services.release')}</button>
  </form></div></div>`).join('\n  ')}
  </div>
</div>`
    : '';

  if (entitlement?.source === 'comp' && status === 'active') {
    return page({
      flashes,
      statusLine: coveredPill,
      content: `${controlGroup}
<p class="disclosure" style="margin-top:24px">${htmlText('account.services.complimentarywhileyoureanapprovedscout2')} ${howItWorks}</p>`,
    });
  }

  if (status === 'active') {
    return page({
      flashes,
      statusLine: t('account.services.nbspyourpaymentisuptodate', { coveredPill }),
      content: `${controlGroup}
${cancellationNotice}
${portalActions}
${journalList}
${withdrawalDoor(withdrawal)}
<p class="disclosure" style="margin-top:24px">${renewalLead({ paidThrough, cancelPending, plan })}${htmlText('account.services.billedthroughstripe')} ${howItWorks}</p>`,
    });
  }

  if (status === 'past_due') {
    return page({
      flashes,
      statusLine: serving ? t('account.services.yourlastpaymentneedsattention') : '<span class="pill off" style="vertical-align:middle"><span class="dot"></span>' + htmlText('account.services.notcovered2') + '</span>',
      content: `${controlGroup}
<p class="notice">${serving ? t('account.services.yourlastpaymentdidntgothrough2') : t('account.services.yourlastpaymentdidntgothrough')}</p>
${journalList}
${cancellationNotice}
${portalActions}
${withdrawalDoor(withdrawal)}
<p class="disclosure" style="margin-top:24px">${htmlText('account.services.billedthroughstripe')} ${howItWorks}</p>`,
    });
  }

  return page({
    flashes,
    content: `<p class="lead">${htmlText('account.services.confidentialprocessingsends2')} <a href="/confidential-processing/data">${htmlText('account.services.yourthinkingoffyourdevice2')}</a>${htmlText('account.services.neveryourjournalwhichstaysonthedeviceitrunsoni2')}</p>
<div class="card">
  <p>${htmlText('account.services.turnonconfidentialprocessing2')}</p>
  ${planTerms ? `<p class="disclosure" data-plan-terms>${esc(planTerms)}</p>` : ''}
  ${checkoutGroup({ csrf, service: t('account.services.confidentialprocessing2'), startNowBox, keyInfo, action: `${SPP_SERVICE_PATH}/checkout`, rows: [
    { plan: 'annual', unitAmount: 9600, buttonText: t('account.services.payyearly'), primary: true },
    { plan: 'monthly', unitAmount: 999, buttonText: t('account.services.paymonthly'), primary: false },
  ] })}
  <p class="disclosure">${esc(SPP_ONE_JOURNAL)} ${htmlText('account.services.taxincludedbilledsecurelythroughstripecomplime')} <a href="/terms">${htmlText('account.services.terms3')}</a>.</p>
</div>
<p class="disclosure" style="margin-top:24px">${esc(SPP_NEVER_PAY)}</p>`,
  });
}

function sppBillingFlashMessages(flash) {
  const messages = [];
  if (flash.checkout === 'success') messages.push(t('account.billing.paymentreceiveditcantakemomentshow2'));
  if (flash.checkout === 'cancel') messages.push(t('account.billing.nochargemade'));
  if (flash.checkout === 'invalid') messages.push(t('account.billing.chooseyearlyormonthlybilling'));
  if (flash.checkout === 'email') messages.push(t('account.billing.billingneedsanemailaddressonyour'));
  if (flash.checkout === 'error') messages.push(t('account.billing.billingcouldntstarttryagain'));
  if (flash.checkout === 'comped') messages.push(t('account.billing.confidentialprocessingisalreadycomplimentaryforyou'));
  if (flash.checkout === 'covered') messages.push(t('account.billing.thissigninalreadyhassubscription'));
  if (flash.journal === 'released') messages.push(t('account.billing.releasedthatjournalnolongerusesyour'));
  if (flash.journal === 'missing') messages.push(t('account.billing.thatjournalwasalreadyreleased'));
  if (flash.billing === 'missing') messages.push(t('account.billing.billingmanagementisavailableoncepaymenthas'));
  if (flash.billing === 'error') messages.push(t('account.billing.billingmanagementdidntopentryagain'));
  return messages.map((message) => `<p class="notice">${esc(message)}</p>`).join('');
}

// === billing ===

// One state per paid service, or null when the service has no place on the billing page:
// never subscribed, or a scout row that has ended.
export function billingEntryState(entitlement) {
  if (!entitlement) return null;
  if (entitlement.source === 'comp') return entitlement.status === 'active' ? 'scout' : null;
  if (entitlement.source !== 'stripe') return null;
  if (entitlement.status === 'past_due') return 'past_due';
  if (entitlement.status === 'active') return entitlement.cancel_at_period_end ? 'stopping' : 'renews';
  if (entitlement.status === 'lapsed' || entitlement.status === 'canceled') return 'stopped';
  return null;
}

// What keeps working through a failed payment, as each service page says it.
const BILLING_PAST_DUE = {
  spl_hosted: t('account.portal.lastpaymentdidntgothroughreaching'),
  spb_hosted: t('account.portal.lastpaymentdidntgothroughmanage2'),
  sme_hosted: t('account.portal.lastpaymentdidntgothroughyour'),
  spp_hosted: t('account.portal.lastpaymentdidntgothroughmanage'),
};

function billingStateLine({ service, entitlement, state, plan }, nowSeconds, rulesCancel = '') {
  const date = formatUnixSecondsDate(entitlement.current_period_end);
  if (state === 'scout') return service === 'spp_hosted' ? t('account.billing.complimentarywhileyoureanapprovedscout') : t('account.billing.freewhileyoureanapprovedscout');
  if (state === 'past_due') return BILLING_PAST_DUE[service];
  if (state === 'stopping') {
    const keep = keepItOn(rulesCancel, t('account.billing.managebillingtokeepit'));
    return date ? t('account.billing.scheduledtostopon', { date, keep }) : t('account.billing.scheduledtostopattheendofthepaidperiod', { keep });
  }
  if (state === 'stopped') {
    return date && entitlement.current_period_end <= nowSeconds ? t('account.billing.stoppedon2', { date }) : t('account.billing.stopped');
  }
  if (!date) return plan ? t('account.billing.renewsautomaticallyat2', { price: formatPlanPrice(plan), tax: taxWords(plan) }) : t('account.billing.renewsautomatically');
  return plan ? t('account.billing.renewsonat2', { date, price: formatPlanPrice(plan), tax: taxWords(plan) }) : t('account.billing.renewsonthepricedidntloadmanagebillingtoseeit', { date });
}

function billingTrail({ state, plan }) {
  if (state === 'scout') return '<span class="tag free">' + htmlText('account.billing.scout') + '</span>';
  if (state === 'stopped') return pill('off', t('account.billing.stopped'));
  if (!plan) return '';
  return `<span class="price">${formatPlanPrice(plan)}<span class="per">/${plan.interval === 'year' ? 'yr' : 'mo'}</span></span>`;
}

const BILLING_ICONS = { spl_hosted: IC_NET, spb_hosted: IC_BACKUP, sme_hosted: IC_GLOBE, spp_hosted: IC_CHIP };

export function renderBilling({ entries, hasCustomer, csrf, flash = {}, menu, nowSeconds, cancelContract = '' }) {
  const flashes = [];
  if (flash.billing === 'missing') flashes.push(t('account.billing.billingmanagementopensonceyouvepaid'));
  if (flash.billing === 'error') flashes.push(t('account.billing.billingmanagementdidntopentryagain2'));
  // Each paid entry's door, then, with the subscription rules on, its own "cancel contracts here".
  const doors = entries
    .map((entry) => [
      withdrawalDoor(entry.withdrawal, { serviceName: entry.name, service: entry.service }),
      billingCancelContract(entry),
    ].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n');
  // With no paid entry to carry one, the page still carries the cancel function's own link.
  const cancelLink = entries.some((entry) => entry.cancelContract) ? '' : cancelContractLink(cancelContract);
  const list = entries.length
    ? `<div class="group">
  ${entries.map((entry) => row(escAttr(entry.href), BILLING_ICONS[entry.service], esc(entry.name), esc(billingStateLine(entry, nowSeconds, cancelContract)), billingTrail(entry))).join('\n  ')}
</div>${doors ? `\n${doors}` : ''}`
    : `<div class="card">
  <div class="empty">
    ${IC_BILLING_SVG}
    <h2>${htmlText('account.billing.youdontpayforanything')}</h2>
    <p>${htmlText('account.billing.nopaidserviceisonyoursign')}</p>
    <a class="btn primary" href="/">${htmlText('account.billing.seeservices')}</a>
  </div>
</div>`;
  const manage = hasCustomer
    ? `<div class="card" style="margin-top:22px">
  <p>${htmlText('account.billing.stripeholdsyourcardyourreceiptsand')}</p>
  ${billingPortalForm({ csrf, action: '/billing/manage' })}
</div>`
    : '';
  return layout({
    title: t('account.billing.billing'),
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} ${htmlText('account.billing.yourservices2')}</a>
${flashes.map((message) => `<p class="notice">${esc(message)}</p>`).join('')}
<div class="pagehead">
  <h1>${htmlText('account.billing.billing')}</h1>
</div>
<p class="intro">${htmlText('account.billing.servicesyoupaysolpbcforwhat')}</p>
${list}
${manage}${cancelLink}`,
  });
}

export function renderBillingReturn({ status, menu }) {
  const success = status === 'success';
  const message = success
    ? t('account.billing.paymentreceiveditcantakemomentshow')
    : t('account.billing.nochargemadeyoucanturnon2');
  return layout({
    title: t('account.billing.privatenetwork'),
    body: `${topbar(menu)}
<a class="back" href="/private-network">${BACK_SVG} ${htmlText('account.billing.yourprivatenetwork2')}</a>
<div class="card">
  <h1>${htmlText('account.billing.privatenetwork')}</h1>
  <p>${esc(message)}</p>
  <a class="btn secondary" href="/private-network">${htmlText('account.billing.backyourprivatenetwork')}</a>
</div>`,
  });
}

// === sign-in surfaces ===

export function renderSignInShell({ sessionCount, passkeyCount, emailCount = 0, menu }) {
  return layout({
    title: t('account.portal.yoursignin'),
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} ${htmlText('account.portal.yourservices')}</a>
<h1>${htmlText('account.portal.yoursignin')}</h1>
<p class="lead">${htmlText('account.signin.howyougetintothispagemanage')}</p>
<div class="group">
  <a class="row" href="/sign-in/sessions">
    ${IC_SESSION_SVG}
    <div class="body">
      <div class="title">${htmlText('account.portal.sessions')}</div>
      <div class="desc">${htmlText('account.signin.devicesandphonessignedinrightnow')}</div>
    </div>
    <div class="trail"><span class="meta" style="margin:0">${esc(sessionCount)} ${htmlText('account.portal.active')}</span>${CHEVRON_SVG}</div>
  </a>
  <a class="row" href="/sign-in/passkeys">
    ${IC_PASSKEY_SVG}
    <div class="body">
      <div class="title">${htmlText('account.portal.passkeys')}</div>
      <div class="desc">${htmlText('account.signin.howyousigninaddmorethan')}</div>
    </div>
    <div class="trail"><span class="meta" style="margin:0">${esc(passkeyCount)}</span>${CHEVRON_SVG}</div>
  </a>
  <a class="row" href="/sign-in/emails">
    ${IC_EMAIL_SVG}
    <div class="body">
      <div class="title">${htmlText('account.signin.emailaddresses')}</div>
      <div class="desc">${htmlText('account.signin.foronetimecodewhenyoudon')}</div>
    </div>
    <div class="trail"><span class="meta" style="margin:0">${esc(emailCount)}</span>${CHEVRON_SVG}</div>
  </a>
</div>`,
  });
}

const EMAIL_BADGES = Object.freeze({
  primary: t('account.emails.primary'),
  verified: t('account.emails.verified'),
  unverified: t('account.emails.unverified'),
});

export function renderSignInEmails({ rows, addError = '', removeError = '', menu }) {
  const rowHtml = rows.map((row) => {
    const actionBase = `/sign-in/emails/${escAttr(row.id)}`;
    const badgeClass = row.badge === 'unverified' ? 'off' : 'on';
    const badge = `<span class="pill ${badgeClass}" style="margin-left:4px"><span class="dot"></span>${esc(EMAIL_BADGES[row.badge] ?? row.badge)}</span>`;
    const expiry = row.expiryText ? `<div class="meta">${esc(row.expiryText)}</div>` : '';
    const makePrimary = row.badge === 'verified'
      ? `<form method="post" action="${actionBase}/make-primary"><button class="btn secondary" type="submit">${htmlText('account.signin.makeprimary')}</button></form>`
      : '';
    const remove = row.badge === 'primary'
      ? ''
      : `<form method="post" action="${actionBase}/remove"><button class="btn danger" type="submit">${htmlText('account.emails.remove')}</button></form>`;
    const verify = row.badge === 'unverified'
      ? `<a class="btn secondary" href="/sign-in/emails/verify?address=${escAttr(row.encodedAddress)}">${htmlText('account.emails.verify')}</a>`
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
  const emptyState = rows.length === 0 ? '<p>' + htmlText('account.signin.noemailaddressesforyoursignin') + '</p>' : '';
  const groupHtml = rowHtml ? `<div class="group">${rowHtml}</div>` : '';
  return layout({
    title: t('account.emails.emailaddresses'),
    body: `${topbar(menu)}
<a class="back" href="/sign-in">${BACK_SVG} ${htmlText('account.emails.yoursignin')}</a>
<h1>${htmlText('account.emails.emailaddresses')}</h1>
${removeErrorHtml}
${emptyState}
${groupHtml}
<div class="card">
  <h2>${htmlText('account.signin.addanemail')}</h2>
  ${addErrorHtml}
  <form method="post" action="/sign-in/emails/add">
    <label for="address">${htmlText('account.emails.email')}</label>
    <input id="address" type="email" name="address" autocomplete="email" required placeholder="you@example.com" maxlength="254">
    <button class="btn primary" type="submit">${htmlText('account.signin.addanemail')}</button>
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
      title: t('account.email.verifyemail'),
      body: `${topbar(menu)}
<a class="back" href="/sign-in/emails">${BACK_SVG} ${htmlText('account.emails.emailaddresses')}</a>
<h1>${htmlText('account.email.verifyemail')}</h1>
<p class="notice">${htmlText('account.email.thisemailisalreadyverifiedforyour')}</p>
<a class="btn secondary" href="/sign-in/emails">${htmlText('account.email.backemailaddresses')}</a>`,
    });
  }
  const errorHtml = error ? `<p class="error">${esc(error)}</p>` : '';
  const addressFieldHtml = address
    ? `<input type="hidden" name="address" value="${escAttr(address)}">`
    : `<input type="email" name="address" value="${escAttr(addressInputValue)}" required autocomplete="email" placeholder="you@example.com" maxlength="254">`;
  const subhead = address
    ? `${htmlText('account.emails.wesentacodeto')} <strong>${esc(address)}</strong>${htmlText('account.emails.enteritbelow')}`
    : t('account.email.enteremailaddressand6digitcode');
  return layout({
    title: t('account.email.verifyemail'),
    body: `${topbar(menu)}
<a class="back" href="/sign-in/emails">${BACK_SVG} ${htmlText('account.emails.emailaddresses')}</a>
<h1>${htmlText('account.email.verifyemail')}</h1>
<p class="lead">${subhead}</p>
${errorHtml}
<div class="card">
  <form method="post" action="/sign-in/emails/verify">
    ${addressFieldHtml}
    <label for="code">${htmlText('account.emails.n6digitcode')}</label>
    <input id="code" class="code" name="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autofocus required oninput="this.value=this.value.replace(/\\D/g,'').slice(0,6)">
    <button class="btn primary block" type="submit">${htmlText('account.emails.verify')}</button>
  </form>
</div>`,
  });
}

// === transparency / data ===

// The one signed-in entry point to /account/export outside a deletion hold.
const TRANSPARENCY_EXPORT_CARD = `<div class="card">
  <h2>${htmlText('account.transparency.downloadwhatsolpbcholds2')}</h2>
  <p>${htmlText('account.portal.itsonefilewhatsheld')}</p>
  <a class="btn primary block" href="/account/export">${htmlText('account.transparency.downloadwhatsolpbcholds2')}</a>
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
  records = null,
  relay = null,
  smeOnSale = false,
}) {
  if (!signedIn) {
    return layout({
      title: t('account.transparency.datatransparency'),
      body: `${brandbar()}
<h1>${htmlText('account.transparency.datatransparency')}</h1>
${transparencyIntro(TRANSPARENCY_LEAD_SIGNED_OUT)}
<div class="card">
  <div class="empty">
    ${IC_EMPTY_DATA_SVG}
    <h2>${htmlText('account.transparency.wedonthaveanythingaboutyou')}</h2>
    <p>${htmlText('account.transparency.solpbcdoesntknowwhoyou')}</p>
    <a class="btn primary" href="/">${htmlText('account.transparency.signintomanageyourservices')}</a>
  </div>
</div>
<p class="disclosure">${htmlText('account.transparency.structureiscommitmentwhatweholdfor')}</p>`,
    });
  }

  const emailHtml = emails.map((row) => `<div class="row" style="cursor:default"><div class="body">
  <div class="title">${esc(row.address)}${row.isPrimary ? ' <span class="pill on" style="margin-left:4px"><span class="dot"></span>' + htmlText('account.transparency.primary') + '</span>' : ''}</div>
  <div class="desc">${row.verifiedAt == null ? t('account.transparency.unverified') : t('account.transparency.verified')} ${htmlText('account.transparency.added')} ${esc(formatDate(row.createdAt))}</div>
</div></div>`).join('');
  const passkeyHtml = passkeys.map((row) => {
    const status = row.revokedAt == null ? t('account.transparency.active') : t('account.transparency.revoked2', { date: formatDate(row.revokedAt) });
    return `<div class="row" style="cursor:default"><div class="body">
  <div class="title">${esc(row.name)}</div>
  <div class="desc">${htmlText('account.transparency.created')} ${esc(formatDate(row.createdAt))} ${htmlText('account.transparency.lastused')} ${esc(row.lastUsedAt == null ? t('account.passkey.neverused') : formatDate(row.lastUsedAt))} · ${esc(status)}</div>
</div></div>`;
  }).join('');
  const sessionHtml = sessions.map((row) => {
    const status = row.revokedAt == null ? t('account.transparency.active') : t('account.transparency.revoked2', { date: formatDate(row.revokedAt) });
    return `<div class="row" style="cursor:default"><div class="body">
  <div class="title">${esc(row.deviceLabel)}</div>
  <div class="desc">${esc(row.ipLabel)} ${htmlText('account.transparency.created2')} ${esc(formatDate(row.createdAt))} ${htmlText('account.transparency.lastactive')} ${esc(formatDate(row.lastActiveAt))} ${htmlText('account.transparency.expires')} ${esc(formatDate(row.expiresAt))} · ${esc(status)}</div>
</div></div>`;
  }).join('');
  return layout({
    title: t('account.transparency.datatransparency'),
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} ${htmlText('account.transparency.yourservices')}</a>
<h1>${htmlText('account.transparency.datatransparency')}</h1>
${transparencyIntro(exportEnabled ? `${TRANSPARENCY_LEAD_SIGNED_IN} ${TRANSPARENCY_LEAD_DOWNLOAD}` : TRANSPARENCY_LEAD_SIGNED_IN)}
${exportEnabled ? TRANSPARENCY_EXPORT_CARD : ''}
<h2 style="margin-top:34px">${htmlText('account.transparency.signin')} <a href="/sign-in" aria-label="${attrText('account.transparency.managesignin2')}" style="${TRANSPARENCY_LINK_STYLE}">${htmlText('account.transparency.manage3')}</a></h2>
<h3 class="section-label">${htmlText('account.transparency.signinid')}</h3>
<div class="group">
  <div class="row" style="cursor:default"><div class="body">
    <div class="meta" style="margin:0">${htmlText('account.transparency.id')}</div><div class="title" style="font-size:.84rem;font-family:ui-monospace,Menlo,monospace;font-weight:400">${esc(accountId)}</div>
    <div class="desc">${htmlText('account.transparency.created')} ${esc(formatDate(accountCreatedAt))} ${htmlText('account.transparency.lastsignin')} ${esc(lastSigninAt == null ? '—' : formatRelativeTime(lastSigninAt, Date.now()))}</div>
  </div></div>
</div>
<h3 class="section-label">${htmlText('account.transparency.emails')} <a href="/sign-in/emails" aria-label="${attrText('account.transparency.manageemails')}">${htmlText('account.transparency.manage3')}</a></h3>
<div class="group">${emailHtml}</div>
<h3 class="section-label">${htmlText('account.transparency.passkeys')} <a href="/sign-in/passkeys" aria-label="${attrText('account.transparency.managepasskeys')}">${htmlText('account.transparency.manage3')}</a></h3>
${passkeyHtml ? `<div class="group">${passkeyHtml}</div>` : '<p>' + htmlText('account.transparency.nopasskeys') + '</p>'}
<h3 class="section-label">${htmlText('account.transparency.sessions')} <a href="/sign-in/sessions" aria-label="${attrText('account.transparency.managesessions')}">${htmlText('account.transparency.manage3')}</a></h3>
${sessionHtml ? `<div class="group">${sessionHtml}</div>` : '<p>' + htmlText('account.transparency.nosessions') + '</p>'}
${renderTransparencyRecords({ records, relay, smeOnSale, exportEnabled })}
${exportEnabled ? '<p style="margin-top:28px"><a class="btn secondary block" href="/account/export">' + htmlText('account.transparency.downloadwhatsolpbcholds2') + '</a></p>' : ''}
<p style="margin-top:28px"><a class="btn danger" href="/account/delete">${htmlText('account.deletion.closeyoursigninandservices')}</a></p>`,
  });
}

// === transparency: every record beyond the sign-in ===
//
// Renders the classes handleTransparency collects with the download's own collector. A class
// named in no group still renders under "other records", and every exported field renders, so
// a class or column added to the inventory reaches this page without an edit here.

const TRANSPARENCY_GROUPS = [
  { heading: t('account.portal.servicesandbilling'), classes: ['entitlements', 'renewal_notices', 'subscription_withdrawals', 'subscription_start_requests', 'subscription_cancellations', 'stripe_customers'] },
  { heading: t('account.transparency.privatenetwork'), href: '/private-network', classes: ['spl_bindings'] },
  { heading: t('account.portal.privatenetworkrelay'), classes: [], relay: true },
  { heading: t('account.transparency.encryptedbackup'), href: '/services/backup', classes: ['spb_bindings', 'spb_mint_audit', 'spb_sweep_audit'] },
  { heading: t('account.transparency.confidentialprocessing'), href: '/confidential-processing', classes: ['spp_bindings', 'spp_mint_audit'] },
  { heading: 'solstone.me', href: SME_SERVICE_PATH, hrefWhen: 'smeOnSale', classes: ['sme_bindings', 'mcp_bridge_bindings'] },
  { heading: t('account.transparency.scout'), href: '/scout', classes: ['scout_applications', 'scout_lifecycle_events'] },
];

// Normal-size orange link text. --orange-text-aa clears 4.5:1 on cream.
const TRANSPARENCY_LINK_STYLE = 'font-weight:400;color:var(--orange-text-aa)';
const TRANSPARENCY_MONO = 'font-size:.84rem;font-family:ui-monospace,Menlo,monospace;font-weight:400;overflow-wrap:anywhere';
const TRANSPARENCY_UNAVAILABLE = t('account.portal.thesecouldntbeloadedjustnow');

const TRANSPARENCY_SERVICE_NAMES = {
  spl_hosted: t('account.transparency.privatenetwork'),
  spb_hosted: t('account.transparency.encryptedbackup'),
  spp_hosted: t('account.transparency.confidentialprocessing'),
  sme_hosted: 'solstone.me',
};
const TRANSPARENCY_SOURCE_NAMES = { comp: t('account.portal.freeasscout'), stripe: t('account.transparency.paid'), apple: t('account.portal.paidthroughappstore'), google: t('account.portal.paidthroughgoogleplay') };
const TRANSPARENCY_NOTICE_KINDS = { ack: t('account.transparency.confirmation'), catch_up: t('account.portal.catchupnotice'), reminder: t('account.portal.renewalreminder'), early_reminder: t('account.portal.renewalreminder'), cooling_off: t('account.transparency.renewalconfirmation'), oneoff: t('account.portal.oneoffnotice'), thanks: t('account.transparency.thankyounote') };
const TRANSPARENCY_ACTORS = { owner: t('account.transparency.you'), operator: 'sol pbc', service: t('account.transparency.solstoneservices') };
// The refusals recorded against a sign-in; the others happen before the journal is identified.
const TRANSPARENCY_REFUSALS = { refused_entitlement: t('account.portal.refusedservicewasnton'), refused_scope: t('account.portal.refusednotanallowedkindaccess') };

// The field a row leads with; a class not listed leads with its first field.
const TRANSPARENCY_TITLE_FIELD = {
  entitlements: 'service',
  renewal_notices: 'subject',
  subscription_withdrawals: 'service',
  subscription_start_requests: 'service',
  subscription_cancellations: 'service',
  stripe_customers: 'stripe_customer_id',
  scout_applications: 'status',
  scout_lifecycle_events: 'to_status',
  spb_mint_audit: 'outcome',
  spp_mint_audit: 'outcome',
  spb_sweep_audit: 'occurred_at',
  mcp_bridge_bindings: 'label',
};

// Free text the owner wrote, or a message we sent them: its own line, quoted or disclosed.
const TRANSPARENCY_OWN_LINE_FIELDS = new Set(['use_case']);

const TRANSPARENCY_FIELD_LABELS = {
  instance_id: t('account.transparency.journal'),
  created_at: t('account.transparency.created'),
  updated_at: t('account.transparency.updated'),
  last_seen_at: t('account.portal.lastseen'),
  lapsed_at: t('account.transparency.lapsed'),
  revoked_at: t('account.transparency.revoked3'),
  rotated_at: t('account.transparency.rotated'),
  consent_acked_at: t('account.portal.consentgiven'),
  consent_disclosure_version: t('account.portal.consenttextversion'),
  occurred_at: t('account.transparency.on'),
  current_period_end: t('account.portal.paidthrough'),
  cancel_at_period_end: t('account.portal.turnsoffatperiodend'),
  enabled_at: t('account.portal.turnedon'),
  source: '',
  source_ref: t('account.transparency.reference'),
  renewal_at: t('account.transparency.renews'),
  content_key: t('account.portal.noticeversion'),
  body: t('account.portal.fullmessagewesent'),
  use_case: t('account.portal.whatyoutoldusyouduse'),
  data_acked_at: t('account.portal.datatermsaccepted'),
  applied_at: t('account.transparency.applied'),
  approved_at: t('account.transparency.approved'),
  correlation_id: t('account.portal.eventid'),
  kind: t('account.transparency.type'),
  from_status: t('account.transparency.from'),
  to_status: t('account.transparency.to'),
  actor_kind: t('account.transparency.by'),
  reason_code: t('account.transparency.reason'),
  entitled_until: t('account.portal.relayaccessuntil'),
  entitled: t('account.portal.relayaccess'),
  objects_deleted: t('account.portal.filesremoved'),
  multipart_aborted: t('account.portal.unfinisheduploadscleared'),
  ttl: t('account.portal.validfor'),
  stripe_customer_id: t('account.portal.stripecustomer'),
  label: t('account.transparency.address'),
  acme_account_uri: t('account.portal.letsencryptaccount'),
  acme_account_pinned_at: t('account.transparency.pinned'),
  acme_account_replaced_at: t('account.portal.accountreplaced'),
  journal_update_refused_at: t('account.head.updaterefused'),
};

const TRANSPARENCY_SHOW_NEWEST = 20;
const TRANSPARENCY_LONG_TEXT = 120;

function transparencyFieldValue(className, name, value, field, record = {}) {
  if (value == null || value === '') return null;
  const transform = field?.transform;
  if (className === 'relay' && name === 'entitled') return record.entitled_until ? null : (value ? t('account.portal.on') : t('account.portal.off'));
  if (typeof value === 'boolean') return value ? t('account.portal.yes') : t('account.portal.no');
  if (transform === 'epoch_ms_to_iso' || transform === 'epoch_s_to_iso' || (className === 'relay' && (name.endsWith('_at') || name === 'entitled_until'))) {
    const ms = typeof value === 'number' ? value : Date.parse(value);
    return formatDate(ms);
  }
  if (name === 'renewal_at') return typeof value === 'number' && value > 0 ? formatDate(value * 1000) : null;
  if (name === 'cancel_at_period_end') return value ? t('account.portal.yes') : null;
  if (name === 'ttl' && typeof value === 'number') return t('account.portal.hours', { value1: Math.round(value / 3600) });
  if (name === 'service' && TRANSPARENCY_SERVICE_NAMES[value]) return TRANSPARENCY_SERVICE_NAMES[value];
  // "paid" beside "paid through <date>" says it twice; the date alone carries it.
  if (name === 'source' && value !== 'comp' && record.current_period_end) return null;
  if (name === 'source' && TRANSPARENCY_SOURCE_NAMES[value]) return TRANSPARENCY_SOURCE_NAMES[value];
  if (name === 'kind' && TRANSPARENCY_NOTICE_KINDS[value]) return TRANSPARENCY_NOTICE_KINDS[value];
  if (name === 'actor_kind' && TRANSPARENCY_ACTORS[value]) return TRANSPARENCY_ACTORS[value];
  if (name === 'outcome') {
    const text = String(value);
    if (text === 'minted') return t('account.portal.given');
    if (text.startsWith('refused_')) return TRANSPARENCY_REFUSALS[text] || t('account.transparency.refused');
    return text.replaceAll('_', ' ');
  }
  if (name === 'label' && className === 'mcp_bridge_bindings') return `${value}.solstone.me`;
  if (name === 'reason_code') return String(value).replaceAll('_', ' ');
  if (name === 'sequence' && className === 'scout_lifecycle_events') return null;
  return String(value);
}

function transparencyFieldLabel(name) {
  return TRANSPARENCY_FIELD_LABELS[name] ?? name.replaceAll('_', ' ');
}

function transparencyRecordRow(className, record, fields) {
  const names = Object.keys(fields || record);
  const titleName = TRANSPARENCY_TITLE_FIELD[className] || names[0];
  const title = transparencyFieldValue(className, titleName, record[titleName], fields?.[titleName], record) ?? '—';
  const parts = [];
  const extra = [];
  for (const name of names) {
    if (name === titleName) continue;
    const value = transparencyFieldValue(className, name, record[name], fields?.[name], record);
    if (value == null) continue;
    const label = esc(transparencyFieldLabel(name));
    if (TRANSPARENCY_OWN_LINE_FIELDS.has(name)) {
      extra.push(`<p class="meta" style="margin:6px 0 0">${label}: "${esc(value)}"</p>`);
    } else if (value.length > TRANSPARENCY_LONG_TEXT) {
      extra.push(`<details><summary style="cursor:pointer;padding:12px 0">${label}</summary><p style="white-space:pre-wrap">${esc(value)}</p></details>`);
    } else {
      // A label and a short value stay together; an id may wrap anywhere on a narrow screen.
      parts.push(name === 'instance_id'
        ? `${label} <span style="${TRANSPARENCY_MONO}">${esc(value)}</span>`
        : `<span style="white-space:nowrap">${label ? `${label} ` : ''}${esc(value)}</span>`);
    }
  }
  const mono = titleName === 'instance_id' || titleName === 'stripe_customer_id';
  const kicker = titleName === 'instance_id' ? '<div class="meta" style="margin:0">' + htmlText('account.portal.journal') + '</div>' : '';
  return `<div class="row" style="cursor:default"><div class="body">
  ${kicker}<div class="title"${mono ? ` style="${TRANSPARENCY_MONO}"` : ''}>${esc(title)}</div>
  ${parts.length ? `<div class="desc">${parts.join(' · ')}</div>` : ''}${extra.join('')}
</div></div>`;
}

function transparencyRecordList(className, records, fields, exportEnabled) {
  if (!records.length) return '<p class="meta" style="margin:0 2px">' + htmlText('account.transparency.noneheld') + '</p>';
  // The collector returns rows oldest first (insertion order); the page leads with the newest.
  const newest = records.slice(-TRANSPARENCY_SHOW_NEWEST).reverse();
  const rows = `<div class="group">${newest.map((r) => transparencyRecordRow(className, r, fields)).join('')}</div>`;
  if (records.length <= TRANSPARENCY_SHOW_NEWEST) return rows;
  const rest = exportEnabled ? ` ${htmlText('account.portal.all')} ${records.length} ${htmlText('account.portal.arein')} <a href="/account/export">${htmlText('account.portal.thedownload')}</a>.` : '';
  return `${rows}
<p class="meta" style="margin:6px 2px 0">${htmlText('account.portal.newest')} ${TRANSPARENCY_SHOW_NEWEST} ${htmlText('account.portal.of')} ${records.length} ${htmlText('account.portal.shown')}${rest}</p>`;
}

function transparencyClassBlock(cls, exportEnabled) {
  return `<h3 class="section-label">${esc(cls.description)}</h3>
${transparencyRecordList(cls.name, cls.records || [], cls.fields || {}, exportEnabled)}`;
}

function transparencyRelayBlock(relay) {
  const label = '<h3 class="section-label">' + htmlText('account.portal.therelaysrecordforeachofyourjournals') + '</h3>';
  if (!relay) return `${label}\n<p class="meta" style="margin:0 2px">${TRANSPARENCY_UNAVAILABLE}</p>`;
  const instances = relay.instances || [];
  const accounting = relay.accounting || [];
  if (!instances.length && !accounting.length) return `${label}\n<p class="meta" style="margin:0 2px">${htmlText('account.transparency.noneheld')}</p>`;
  const rows = instances.map((i) => transparencyRecordRow('relay', i, Object.fromEntries(Object.keys(i).map((k) => [k, {}])))).join('')
    + accounting.map((a) => `<div class="row" style="cursor:default"><div class="body">
  <div class="meta" style="margin:0">${htmlText('account.portal.journal')}</div><div class="title" style="${TRANSPARENCY_MONO}">${esc(a.instance_id)}</div>
  <div class="desc">${htmlText('account.transparency.relaysrecordforyourjournalcouldn')}</div>
</div></div>`).join('');
  return `${label}\n<div class="group">${rows}</div>`;
}

export function renderTransparencyRecords({ records, relay = null, smeOnSale = false, exportEnabled = false }) {
  const byName = new Map((records?.classes || []).map((cls) => [cls.name, cls]));
  const failed = new Set(records?.failed || []);
  const descriptions = records?.descriptions || {};
  const placed = new Set();
  const flags = { smeOnSale };
  const block = (name) => {
    placed.add(name);
    if (byName.has(name)) return transparencyClassBlock(byName.get(name), exportEnabled);
    return `<h3 class="section-label">${esc(descriptions[name] || name.replaceAll('_', ' '))}</h3>
<p class="meta" style="margin:0 2px">${TRANSPARENCY_UNAVAILABLE}</p>`;
  };
  const known = (name) => byName.has(name) || failed.has(name);
  const sections = TRANSPARENCY_GROUPS.map((group) => {
    const blocks = group.classes.filter(known).map(block);
    if (group.relay) blocks.push(transparencyRelayBlock(relay));
    if (!blocks.length) return '';
    const link = group.href && (!group.hrefWhen || flags[group.hrefWhen])
      ? ` · <a href="${escAttr(group.href)}" aria-label="${attrText('account.transparency.manage3')} ${escAttr(group.heading)}" style="${TRANSPARENCY_LINK_STYLE}">${htmlText('account.transparency.manage3')}</a>` : '';
    return `<h2 style="margin-top:34px">${esc(group.heading)}${link}</h2>
${blocks.join('\n')}`;
  }).filter(Boolean);
  const others = [...byName.keys(), ...failed].filter((name) => !placed.has(name));
  if (others.length) {
    sections.push(`<h2 style="margin-top:34px">${htmlText('account.transparency.otherrecords')}</h2>
${others.map(block).join('\n')}`);
  }
  sections.push(`<h2 style="margin-top:34px">${htmlText('account.transparency.supportrequests')}</h2>
<p>${htmlText('account.transparency.yoursupportrequestsareheldbythesupportservicew')} <a href="/support" style="${TRANSPARENCY_LINK_STYLE}">${htmlText('account.transparency.yoursupportpage')}</a>.</p>`);
  return sections.join('\n');
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
  <h2>${htmlText('account.deletion.thereisproblem')}</h2>
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

// What stops at confirm (deletion-hold.js), with the two tails nothing can cut at once: a
// backup credential already issued for a running backup or restore, and a solstone.me token
// already issued (it lasts up to 600 s). Operator approval of the tails, 2026-10-02. The line says
// 15 minutes, the bound the services Terms (section 14) and the close notice state; 600 s sits inside it.
export const CLOSE_TIMING_LINE = t('account.portal.yourservicesstopassoonasyou');

// What closing does to a paid subscription: before the subscription rules, and under them, where a
// renewed annual year's whole months left are refunded and the cancel is "cancel contracts here".
const CLOSE_PAID_LINE = t('account.deletion.ifyoupayforservicenothingrenews');
const CLOSE_PAID_LINE_RULES = t('account.deletion.ifyoupayforaservicenothingrenewswhileyoursigni');

export function renderDeletionPage({ menu, error = '', status = '', rulesOn = false }) {
  return layout({
    title: t('account.deletion.closeyoursigninandservices2'),
    mainClass: 'deletion-surface',
    deletionActive: Boolean(menu?.deletion),
    body: `${topbar(menu)}
<a class="back" href="/transparency">${BACK_SVG} ${htmlText('account.deletion.datatransparency2')}</a>
${renderDeletionForm({
  heading: t('account.deletion.closeyoursigninandservices2'),
  action: '/account/delete/proof/otp',
  submitLabel: t('account.deletion.sendconfirmationcode'),
  hidden: { purpose: 'delete' },
  error,
  status,
  statusId: 'deletion-request-status',
  intro: t('account.deletion.thisendseveryserviceonyoursign'),
})}
<p>${htmlText('account.deletion.journalonyourdevicesisnttouched')}</p>
<p>${esc(CLOSE_TIMING_LINE)} ${htmlText('account.deletion.fromthemomentyouconfirmyouhave72hourstochangey')}</p>
<p class="notice">${esc(rulesOn ? CLOSE_PAID_LINE_RULES : CLOSE_PAID_LINE)}</p>
<p class="notice">${htmlText('account.deletion.ifsolpbcrunsyourencryptedbackup')}</p>
<p class="disclosure"><a href="https://solpbc.org/privacy#your-rights">${htmlText('account.deletion.whatsolpbcdeletesandfewthings')}</a></p>`,
  });
}

export function renderDeletionProofPage({ menu, purpose, error = '', status = '' }) {
  const action = purpose === 'cancel' ? '/account/delete/cancel' : '/account/delete/confirm';
  const actionLabel = purpose === 'cancel' ? t('account.deletion.keepmysignin') : t('account.deletion.closemysignin');
  return layout({
    title: t('account.deletion.confirmitsyou'),
    mainClass: 'deletion-surface',
    deletionActive: Boolean(menu?.deletion),
    body: `${topbar(menu)}
<a class="back" href="/account/delete">${BACK_SVG} ${htmlText('account.deletion.back')}</a>
${renderDeletionForm({
  heading: t('account.deletion.confirmitsyou'),
  action: '/account/delete/proof/otp/verify',
  submitLabel: t('account.deletion.verifycode'),
  hidden: { purpose },
  error,
  status,
  statusId: 'deletion-otp-status',
  intro: t('account.deletion.entercodewejustemailedyou'),
  fields: [{
    id: 'deletion-otp-code', name: 'code', label: t('account.deletion.n6digitcode2'),
    hint: t('account.deletion.codeexpiresin10minutes'), type: 'text', inputmode: 'numeric',
    autocomplete: 'one-time-code', pattern: '[0-9]*',
  }],
})}
${renderDeletionForm({
  heading: t('account.deletion.confirmwithyourpasskey'),
  action,
  submitLabel: actionLabel,
  hidden: { purpose },
  status: '',
  statusId: 'deletion-passkey-status',
  intro: t('account.deletion.ifyousetuppasskeyconfirmwith'),
  extra: `<button class="btn secondary" type="button" data-deletion-passkey data-purpose="${escAttr(purpose)}">${htmlText('account.deletion.useyourpasskey')}</button>`,
})}
${deletionPasskeyScript()}`,
  });
}

export function renderExportPage({ menu, error = '', status = '' }) {
  const back = menu?.deletion
    ? `<a class="back" href="/account/delete">${BACK_SVG} ${htmlText('account.deletion.closingyoursignin2')}</a>`
    : `<a class="back" href="/transparency">${BACK_SVG} ${htmlText('account.deletion.datatransparency2')}</a>`;
  return layout({
    title: t('account.deletion.downloadwhatsolpbcholds'),
    deletionActive: Boolean(menu?.deletion),
    body: `${topbar(menu)}
${back}
${renderDeletionForm({
  heading: t('account.deletion.downloadwhatsolpbcholds'),
  action: '/account/export/proof/otp',
  submitLabel: t('account.deletion.sendconfirmationcode'),
  error,
  status,
  statusId: 'export-request-status',
  intro: t('account.portal.confirmitsyoufirstifservice'),
})}`,
  });
}

export function renderExportProofPage({ menu, error = '', status = '' }) {
  return layout({
    title: t('account.portal.confirmyourdownload'),
    deletionActive: Boolean(menu?.deletion),
    body: `${topbar(menu)}
<a class="back" href="/account/export">${BACK_SVG} ${htmlText('account.deletion.downloadwhatsolpbcholds')}</a>
${renderDeletionForm({
  heading: t('account.portal.confirmyourdownload'),
  action: '/account/export/proof/otp/verify',
  submitLabel: t('account.deletion.verifycode'),
  error,
  status,
  statusId: 'export-otp-status',
  intro: t('account.portal.entercodesentyourverifiedemailaddress'),
  fields: [{
    id: 'export-otp-code', name: 'code', label: t('account.deletion.n6digitcode2'),
    hint: t('account.deletion.codeexpiresin10minutes'), type: 'text', inputmode: 'numeric',
    autocomplete: 'one-time-code', pattern: '[0-9]*',
  }],
})}
${renderDeletionForm({
  heading: t('account.portal.passkeyverification'),
  action: '/account/export',
  submitLabel: t('account.portal.downloadfile'),
  status: '',
  statusId: 'export-passkey-status',
  intro: t('account.portal.ifyouhaveanactivepasskeyyou'),
  extra: '<button class="btn secondary" type="button" data-export-passkey>' + htmlText('account.portal.verifywithpasskey') + '</button>',
})}
${exportPasskeyScript()}`,
  });
}

export const DELETION_EXPORT_PROMPT_LINK = t('account.portal.downloadwhatsolpbcholdsbeforeyour');

export function renderDeletionCancelPage({ menu, phase, exportEnabled = false, deadline = '' }) {
  if (phase === 'purging') {
    return layout({
      title: t('account.deletion.closingyoursignin2'),
      mainClass: 'deletion-surface',
      deletionActive: Boolean(menu?.deletion),
      body: `${topbar(menu)}<h1>${htmlText('account.deletion.closingyoursignin2')}</h1><p>${esc(DELETION_PAST_DEADLINE_LINE)}</p>`,
    });
  }
  const exportLink = exportEnabled
    ? `<p><a href="/account/export">${esc(DELETION_EXPORT_PROMPT_LINK)}</a></p>`
    : '';
  return layout({
    title: t('account.deletion.keepyoursignin'),
    mainClass: 'deletion-surface',
    deletionActive: Boolean(menu?.deletion),
    body: `${topbar(menu)}
${renderDeletionForm({
  heading: t('account.deletion.keepyoursignin'),
  action: '/account/delete/proof/otp',
  submitLabel: t('account.deletion.sendcode'),
  hidden: { purpose: 'cancel' },
  intro: t('account.deletion.keepyoursigninconfirmits'),
  extra: '<p class="notice">' + htmlText('account.deletion.ifsubscriptionwasduerenewwhileyour') + '</p>',
  statusId: 'deletion-cancel-status',
})}${deadline ? `<p>${esc(deletionDeadlineLine(deadline))}</p>` : ''}${exportLink}`,
  });
}

export const DELETION_STATUS_SIGN_IN_LINE = t('account.portal.keepitsigninagainthenconfirm');
export const DELETION_STATUS_SIGN_IN_LINK = t('account.portal.signinkeepit');
export const DELETION_PAST_DEADLINE_LINE = t('account.portal.n72hoursareupsothiscan');

// canSignInToCancel: the hold is still cancellable but this viewer holds only the
// receipt (or a session that cannot cancel). A fresh sign-in during the hold lands
// on /account/delete, where cancelling asks for its own fresh proof.
export function deletionDeadlineLine(deadline) {
  return t('account.deletion.yoursigninclosesatuntilthenyoucanchangeyourmin', { deadline });
}

export function renderDeletionStatus({ state = t('account.deletion.wecantshowwherethisstands'), canCancel = false, canSignInToCancel = false, deadline = '' } = {}) {
  const action = canCancel
    ? '<p><a class="btn primary" href="/account/delete">' + htmlText('account.deletion.keepmysignin') + '</a></p>'
    : canSignInToCancel
      ? `<p>${esc(DELETION_STATUS_SIGN_IN_LINE)}</p><p><a class="btn primary" href="/?signin">${esc(DELETION_STATUS_SIGN_IN_LINK)}</a></p>`
      : '';
  return layout({
    title: t('account.deletion.yoursignin2'),
    body: `<div class="card">${brandbar()}<h1>${htmlText('account.deletion.yoursignin2')}</h1><p aria-live="polite">${esc(state)}</p>${deadline ? `<p>${esc(deletionDeadlineLine(deadline))}</p>` : ''}${action}</div>`,
    showFooter: false,
  });
}

export function renderDeletionUnavailablePage({ menu } = {}) {
  return layout({
    title: t('account.deletion.yourrequestcantbeconfirmedright'),
    mainClass: 'deletion-surface',
    deletionActive: Boolean(menu?.deletion),
    body: `${topbar(menu)}
<div class="card">
  <h1>${htmlText('account.deletion.yourrequestcantbeconfirmedright')}</h1>
  <p class="lead">${htmlText('account.deletion.pleasetryagainlater')}</p>
  <p><a class="btn primary" href="/account/delete">${htmlText('account.deletion.back')}</a></p>
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
    status.textContent = ${scriptText('account.portal.passkeyverified', "'")};
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
    status.textContent = ${scriptText('account.portal.passkeyproofverified', "'")};
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
    title: t('account.portal.confirmitsyou'),
    body: `${topbar(menu)}
<a class="back" href="${escAttr(next)}">${BACK_SVG} ${htmlText('account.portal.back')}</a>
${renderDeletionForm({
  heading: t('account.portal.confirmitsyou'),
  action: '/account/credential-change/proof/otp/verify',
  submitLabel: t('account.portal.verifycode'),
  hidden: { next },
  error,
  status,
  statusId: 'credential-change-otp-status',
  intro: t('account.portal.thischangeneedsfreshcodeentercode'),
  fields: [{
    id: 'credential-change-otp-code', name: 'code', label: t('account.portal.n6digitcode'),
    hint: t('account.portal.thecodeexpiresin10minutes'), type: 'text', inputmode: 'numeric',
    autocomplete: 'one-time-code', pattern: '[0-9]*',
  }],
})}
${renderDeletionForm({
  heading: t('account.portal.passkeyverification2'),
  action: next,
  method: 'get',
  submitLabel: t('account.portal.continue'),
  status: '',
  statusId: 'credential-change-passkey-status',
  intro: t('account.portal.ifyouhaveanactivepasskeyyoumustalsoverifyitbef'),
  extra: `<button class="btn secondary" type="button" data-credential-change-passkey data-next="${escAttr(next)}">${htmlText('account.portal.verifywithpasskey2')}</button>`,
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
    status.textContent = ${scriptText('account.portal.passkeyverifiedcheckyouremailforacodetoo', "'")};
  } catch (_) { window.location.reload(); }
}));
</script>`;
}

export function renderSignInSessions({ rows, currentIdHash, now, menu }) {
  const hasOtherSessions = rows.some((row) => row.id_hash !== currentIdHash);
  const revokeOthers = hasOtherSessions
    ? `<div class="btn-row" style="margin-top:16px"><form method="post" action="/sign-in/sessions/revoke-others">
  <button class="btn danger" type="submit" onclick="return confirm(${escAttr(scriptText('account.signin.confirmotherdevicessignout', "'"))})">${htmlText('account.signin.signouteveryotherdevice')}</button>
</form></div>`
    : '';
  const rowHtml = rows.map((row) => {
    const isCurrent = row.id_hash === currentIdHash;
    const action = `/sign-in/sessions/${escAttr(row.id_hash)}/revoke`;
    const revoke = isCurrent
      ? ''
      : `<div class="trail"><form method="post" action="${action}"><button class="btn danger" type="submit">${htmlText('account.signin.signout')}</button></form></div>`;
    return `<div class="row" style="cursor:default">
  <div class="body">
    <div class="title">${esc(row.deviceLabel)}${isCurrent ? ' <span class="pill on" style="margin-left:4px"><span class="dot"></span>' + htmlText('account.signin.currentdevice') + '</span>' : ''}</div>
    <div class="desc">${esc(row.ipLabel)} ${htmlText('account.portal.lastactive')} ${esc(formatRelativeTime(row.last_active_at, now))} ${htmlText('account.portal.signedin')} ${esc(formatRelativeTime(row.created_at, now))}</div>
  </div>
  ${revoke}
</div>`;
  }).join('');
  return layout({
    title: t('account.portal.sessions'),
    body: `${topbar(menu)}
<a class="back" href="/sign-in">${BACK_SVG} ${htmlText('account.portal.yoursignin')}</a>
<h1>${htmlText('account.portal.sessions')}</h1>
<p class="lead">${htmlText('account.signin.devicesandphonescurrentlysignedinmanage')}</p>
<div class="group">${rowHtml}</div>
${revokeOthers}`,
  });
}

export function renderSignInPasskeys({ rows, enrollJsIncluded, menu }) {
  const emptyState = rows.length === 0
    ? `<p class="empty">${htmlText('account.passkey.nopasskeysenrollednexttimeyousign')}</p>`
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
      <label for="friendly-name-${escAttr(row.credential_id)}">${htmlText('account.cancel.name')}</label>
      <input id="friendly-name-${escAttr(row.credential_id)}" name="friendly_name" value="${escAttr(row.friendlyNameInput)}" maxlength="64" autocomplete="off">
      <div class="btn-row"><button class="btn secondary" type="submit">${htmlText('account.passkeys.rename')}</button></div>
    </form>
  </div>
  <div class="trail"><form method="post" action="${removeAction}">
    <button class="btn danger" type="submit" onclick="return confirm(${escAttr(scriptText('account.passkeys.confirmremoval', "'"))})">${htmlText('account.passkeys.remove')}</button>
  </form></div>
</div>`;
  }).join('');
  const groupHtml = rowHtml ? `<div class="group">${rowHtml}</div>` : '';
  return layout({
    title: t('account.passkeys.passkeys'),
    body: `${topbar(menu)}
<a class="back" href="/sign-in">${BACK_SVG} ${htmlText('account.passkeys.yoursignin')}</a>
<h1>${htmlText('account.passkeys.passkeys')}</h1>
<p class="lead">${htmlText('account.passkey.howyousigninyoucanhave')}</p>
${emptyState}
${groupHtml}
<div class="card">
  <h2>${htmlText('account.passkeys.addapasskey')}</h2>
  <label for="passkey-friendly-name">${htmlText('account.passkeys.devicename')}</label>
  <input id="passkey-friendly-name" type="text" maxlength="64" placeholder="${attrText('account.passkeys.devicenameoptional')}" autocomplete="off">
  <div class="btn-row"><button id="passkey-add" class="btn primary" type="button">${htmlText('account.passkeys.addapasskey')}</button></div>
  <div id="passkey-enroll-error" class="error" hidden></div>
  </div>`,
    afterMain: enrollJsIncluded ? `<script>${ENROLL_JS}</script>` : '',
  });
}

export function renderServicesScout({ application, nowMs, flash = {}, menu, sppOnSale = false }) {
  const flashes = flashMessages(flash);
  // the old standalone scouts program had a news feed and a feedback form;
  // the converged portal drops both, but their destinations live on, news →
  // the public release notes, feedback → support. give them a permanent home
  // here, present in every scout state, as first-class destination rows.
  const scoutLinks = `<div class="group" style="margin-top:26px">
  <a class="row" href="https://solstone.app/releases">
    ${IC_NEWS_SVG}
    <div class="body">
      <div class="title">${htmlText('account.services.whatsnewinsolstone')} ${EXT_SVG}</div>
      <div class="desc">${htmlText('account.services.releasenoteswhatsshippedandwhat')}</div>
    </div>
    <div class="trail">${CHEVRON_SVG}</div>
  </a>
  <a class="row" href="/support">
    ${IC_SUPPORT_SVG}
    <div class="body">
      <div class="title">${htmlText('account.scout.sharefeedback')}</div>
      <div class="desc">${htmlText('account.services.telluswhatyoureseeingor')}</div>
    </div>
    <div class="trail">${CHEVRON_SVG}</div>
  </a>
</div>`;
  const page = ({ statusLine, lead, content = '' }) => layout({
    title: t('account.scout.scout'),
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} ${htmlText('account.scout.yourservices')}</a>
${flashes}
<div class="pagehead">
  <h1>${htmlText('account.scout.scout')}</h1>
  <p class="signed-in">${statusLine}</p>
</div>
<p class="lead">${lead}</p>
${content}
${scoutLinks}`,
  });

  if (application?.status === 'revoked') {
    return page({
      statusLine: '<span class="pill off" style="vertical-align:middle"><span class="dot"></span>' + htmlText('account.services.accesshasended') + '</span>',
      lead: t('account.services.scoutaccessforthissigninhas'),
    });
  }

  if (application?.status === 'approved') {
    const ackForm = application.data_acked_at == null
      ? `<div class="card">
  <h2>${htmlText('account.services.confirmscoutcovenant')}</h2>
  ${scoutApplyForm({ includeUseCase: false, buttonText: t('account.services.iunderstand') })}
</div>`
      : '';
    return page({
      statusLine: '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>' + htmlText('account.scout.approved') + '</span> ' + htmlText('account.scout.nbspscoutaccessisapprovedforthissignin') + '',
      lead: sppOnSale
        ? t('account.services.confidentialprocessingiscomplimentarywhileyoure')
        : t('account.services.confidentialprocessingisavailableapprovedscoutsena2'),
      content: ackForm,
    });
  }

  if (application?.status === 'pending') {
    const pendingText = application.applied_at == null
      ? t('account.scout.pending')
      : t('account.scout.pendingapplied', { relativeTime: formatRelativeTime(application.applied_at, nowMs) });
    return page({
      statusLine: `<span class="pill off" style="vertical-align:middle"><span class="dot"></span>${esc(pendingText)}</span>`,
      lead: t('account.services.yourscoutrequestisunderreview'),
    });
  }

  return page({
    statusLine: '<span class="pill off" style="vertical-align:middle"><span class="dot"></span>' + htmlText('account.services.notapproved') + '</span>',
    lead: sppOnSale
      ? t('account.services.requestscoutaccessforthissignin2')
      : t('account.services.requestscoutaccessforthissignin'),
    content: `<div class="card">
  <h2>${htmlText('account.services.requestaccess')}</h2>
  ${scoutApplyForm({ includeUseCase: true, buttonText: t('account.scout.apply') })}
</div>`,
  });
}

function scoutApplyForm({ includeUseCase, buttonText }) {
  const useCase = includeUseCase
    ? `<label for="use-case">${htmlText('account.portal.whatwouldyoulikeuseitfor')}</label>
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
    ${ackField(t('account.portal.iunderstand'))}`;
}

export function renderGoodbye() {
  return layout({
    title: t('account.signin.signedout'),
    body: `${brandbar()}
<h1>${htmlText('account.signin.signedout2')}</h1>
<p class="lead">${htmlText('account.signin.seeyounexttime')}</p>
<a class="btn secondary" href="/">${htmlText('account.signin.startover')}</a>`,
  });
}

// GENERATED by the terms renderer from the canonical services Terms of Service source
// (the region between the CANONICAL PUBLISHED TEXT delimiters). Regenerate and diff on any
// source change; never hand-edit the body between `${brandbar()}` and the closing template literal.
export function renderServicesTerms() {
  const title = t('account.terms.solstoneservicesterms');
  return layout({
    title,
    body: `${brandbar()}
<h1>${esc(title)}</h1>
<p class="meta"><em>${esc(t('account.terms.effectivenovember102026solpbcacoloradopublicbe'))}</em></p>
<p>${termsText('account.terms.thesetermscover1servicessolstoneapp2theplaceyo', ["<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p class="terms-box"><strong>${esc(t('account.terms.paidservicesrenewautomaticallyasubscriptionren'))}</strong></p>
<h2>${esc(t('account.terms.shortversion'))}</h2>
<ul>
  <li>${termsText('account.terms.n1nothinghereisrequired2thesolstonesoftwareruns', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.yourjournalisalwaysprivateonlyyoursand1nothing', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1youcanalwaysturnaserviceoffandwhatsolpbcrunsf', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1ifyoupayitrenewsuntilyoucancelandcancelingisa', ["<strong>", "</strong>", "<em>", "</em>", "<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1ifyoustoppayingforencryptedbackupwekeeptheenc', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1whatweholdissmallnamedandmostlyyourstoseeexpo', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1weneverselllicensesublicenseorleaseyourdataan', ["<strong>", "</strong>", "<a href=\"https://solpbc.org/articles\">", "</a>"])}</li>
  <li>${termsText('account.terms.n1ifsomethinggoeswrongwhethertheclaimisaboutase', ["<strong>", "</strong>"])}</li>
  <li><strong>${esc(t('account.terms.ifthesetermschangeinwaythat'))}</strong></li>
</ul>
<h2>${esc(t('account.terms.howreadtheseterms'))}</h2>
<p>${esc(t('account.terms.shortversionissummarysectionsbelowcarry'))}</p>
<p>${termsText('account.terms.twootherdocumentsgowiththesetermsthe1privacypo', ["<strong>", "</strong>", "<a href=\"https://solpbc.org/privacy\">", "</a>"])}</p>
<hr>
<h2>${esc(t('account.terms.partonewhatapplieseverything'))}</h2>
<h2>${esc(t('account.terms.n1whothesetermsarebetweenand'))}</h2>
<p>${termsText('account.terms.thesetermsareacontractbetweenyouand1solpbc2aco', ["<strong>", "</strong>"])}</p>
<ul>
  <li>${termsText('account.terms.n1servicessolstoneapp2theservicesportalwhereyou', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1thesolstoneservices2solpbcrunsforyouprivatene', ["<strong>", "</strong>"])}</li>
  <li><strong>${esc(t('account.terms.scoutprogram'))}</strong></li>
</ul>
<p>${esc(t('account.terms.theydontcoversolstonesoftwareitself'))}</p>
<p>${esc(t('account.terms.youagreethesetermsfirsttimeyou'))}</p>
<p>${esc(t('account.terms.youneedbeatleast13sign'))}</p>
<h2>${esc(t('account.terms.n2yoursignin'))}</h2>
<ul>
  <li>${termsText('account.terms.n1howitworks2yousigninwithyouremailwesendyouaco', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1whatweholdforasignin2theprivacypolicylistseac', ["<strong>", "</strong>", "<a href=\"https://solpbc.org/privacy#sign-in\">", "</a>", "<a href=\"https://services.solstone.app/transparency\">", "</a>", "<a href=\"https://services.solstone.app/support\">", "</a>"])}</li>
  <li>${termsText('account.terms.n1itsyourstokeepsafe2asigninisforonepersonkeepy', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1thesolstoneapphasnosigninofitsown2theportalis', ["<strong>", "</strong>"])}</li>
</ul>
<h2>${esc(t('account.terms.n3payingrenewingandcanceling'))}</h2>
<p>${esc(t('account.terms.thissectionappliesanyserviceyousubscribe'))}</p>
<ul>
  <li>${termsText('account.terms.n1everythingisshownbeforeyoupay2eachservicehasa', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1yoursubscriptionrenewsautomatically2attheendo', ["<strong>", "</strong>", "<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1arenewalisneverasurprise2onanannualplanweemai', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1wetellyoubeforeapricechanges2apricechangeisam', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1cancelanytimewithnomorestepsthanittooktosubsc', ["<strong>", "</strong>", "<em>", "</em>", "<em>", "</em>"])}</li>
  <li id="withdrawal">${termsText('account.terms.n1youcanwithdrawwithin14daysforafullrefundwhere', ["<strong>", "</strong>", "<em>", "</em>"])}</li>
  <li>${termsText('account.terms.n1whenacanceltakeseffect2onamonthlyplanandinthe', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1nothingonyourdevicesislostwhenaservicestopswi', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1refunds2awithdrawalwithin14daysrefundseveryth', ["<strong>", "</strong>", "<strong>", "</strong>"])}</li>
</ul>
<p>${termsText('account.terms.n1withdrawalform2fillthisinandsenditonlyifyouwa', ["<strong>", "</strong>"])}</p>
<p>${esc(t('account.terms.solpbc16095east109thplacecommerce'))}</p>
<p>${esc(t('account.terms.iherebygivenoticethatiwithdraw'))}</p>
<p>${esc(t('account.terms.orderedon'))}</p>
<p>${esc(t('account.terms.name'))}</p>
<p>${esc(t('account.terms.address'))}</p>
<p>${esc(t('account.terms.signatureonlyifyousendthison'))}</p>
<p>${esc(t('account.terms.date'))}</p>
<h2>${esc(t('account.terms.n4paymentishandledbystripe'))}</h2>
<ul>
  <li>${termsText('account.terms.wedonttakeorstoreyourcardpaymentsrunthrough1st', ["<strong>", "</strong>", "<a href=\"https://stripe.com/legal\">", "</a>", "<a href=\"https://stripe.com/privacy\">", "</a>"])}</li>
  <li>${termsText('account.terms.whatwesendstripewhatwekeepfromwhatitsendsbacka', ["<a href=\"https://solpbc.org/privacy#billing\">", "</a>", "<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.striperunsthefraudandantimoneylaunderingchecks', ["<a href=\"https://solpbc.org/privacy#processors\">", "</a>"])}</li>
</ul>
<h2>${esc(t('account.terms.n5fairuse'))}</h2>
<p>${esc(t('account.terms.servicesareforyouyourownjournal'))}</p>
<p>${termsText('account.terms.n1whatsuspensioncantouchandwhatitnevercan2susta', ["<strong>", "</strong>"])}</p>
<h2>${esc(t('account.terms.n6howyourdataisusedand'))}</h2>
<p>${termsText('account.terms.n1whataservicehandlestodoitsjob2isinitssectioni', ["<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1thecovenants2ourarticlesofincorporationcarrya', ["<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<ul>
  <li>${esc(t('account.terms.neverselllicensesublicenseorleaseyour'))}</li>
  <li>${esc(t('account.terms.neveruseitfortargetedadvertisingor'))}</li>
  <li>${esc(t('account.terms.neverhanditoutsidesolpbcexcept'))}</li>
  <li>${esc(t('account.terms.andcarryallthisthroughanysale'))}</li>
</ul>
<p>${termsText('account.terms.theprivacypolicysetsouteachoftheseinfullitscit', ["<strong>", "</strong>", "<a href=\"https://solpbc.org/privacy#covenants\">", "</a>", "<a href=\"https://solpbc.org/articles\">", "</a>"])}</p>
<p>${termsText('account.terms.n1whoprocessesdataforus2cloudflaremicrosoftazur', ["<strong>", "</strong>", "<a href=\"https://solpbc.org/privacy#processors\">", "</a>"])}</p>
<h2>${esc(t('account.terms.n7howlongwekeepitclosing'))}</h2>
<p>${termsText('account.terms.n1theprivacypolicyisthehomeforallofthisanditisp', ["<strong>", "</strong>", "<a href=\"https://solpbc.org/privacy#what-we-hold\">", "</a>", "<a href=\"https://solpbc.org/privacy#your-rights\">", "</a>"])}</p>
<ul>
  <li>${termsText('account.terms.n1itstopstheservicesonyoursigninassoonasyouconf', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1youhave72hourstochangeyourmind2keepyoursignin', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1whenthe72hoursareupitendsyoursubscriptions2ev', ["<strong>", "</strong>", "<em>", "</em>"])}</li>
  <li>${termsText('account.terms.n1afterthe72hourssolpbcdeletestheoperatedbackup', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1somethingsoutlastitandtheprivacypolicynamesth', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1itnevertouches2yourjournalonyourdevicesyourde', ["<strong>", "</strong>"])}</li>
</ul>
<p>${esc(t('account.terms.youhaveprivacyrightsyourstateor'))}</p>
<h2>${esc(t('account.terms.n8servicesareprovidedasis'))}</h2>
<p>${esc(t('account.terms.weworkkeepeveryserviceupbut'))}</p>
<p>${termsText('account.terms.n1tothefullestextentpermittedbylaweachserviceis', ["<strong>", "</strong>"])}</p>
<h2>${esc(t('account.terms.n9changestheseterms'))}</h2>
<p>${esc(t('account.terms.wemayupdatethesetermsifchange'))}</p>
<p>${esc(t('account.terms.whenweaddserviceweaddits'))}</p>
<p>${esc(t('account.terms.nochangethesetermscanweakencovenants'))}</p>
<h2>${esc(t('account.terms.n10legaldetails'))}</h2>
<ul>
  <li>${termsText('account.terms.thesetermsarebetweenyouand1solpbc2acoloradopub', ["<strong>", "</strong>", "<strong>", "</strong>"])}</li>
  <li>${esc(t('account.terms.thesetermsprivacypolicydisclosureyoure'))}</li>
  <li>${esc(t('account.terms.whensectionsaysweemailyouwe'))}</li>
  <li>${esc(t('account.terms.ifcourtfindspartthesetermsunenforceable'))}</li>
  <li>${esc(t('account.terms.wecanhandthesetermsoryour'))}</li>
  <li>${termsText('account.terms.n1yourrightsasaconsumer2ifaserviceisntasdescrib', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1whattheservicesworkwith2eachserviceworkswitht', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1questionsandcomplaints2supportsolstoneappor15', ["<strong>", "</strong>"])}</li>
</ul>
<hr>
<h2>${esc(t('account.terms.parttwoeachserviceoneattime'))}</h2>
<p>${esc(t('account.terms.eachsectionbelowcoversoneservicesol'))}</p>
<h2>${esc(t('account.terms.n11privatenetworkrelay'))}</h2>
<p>${termsText('account.terms.n1whatitis2arelaysolpbcrunssoyourdevicescanreac', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1youneverhavetopayus2thesameprivateconnectioni', ["<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1blindbyconstruction2therelaypassesencryptedby', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1whattherelayhandlesandwhatwekeep2tomoveyourby', ["<strong>", "</strong>", "<strong>", "</strong>", "<a href=\"https://solpbc.org/privacy#private-network\">", "</a>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1whenitstops2cancelorletitlapseandtherelaykeep', ["<strong>", "</strong>"])}</p>
<h2>${esc(t('account.terms.n12encryptedbackupoperatedtier'))}</h2>
<p>${termsText('account.terms.n1whatitis2storagesolpbcrunssoanencryptedcopyof', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1youneverhavetopayus2pointsolstoneatyourownbuc', ["<strong>", "</strong>", "<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1encryptedbyconstructiononlyyoucanreadit2befor', ["<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1whatthestoragehandlesandwhatwekeep2theencrypt', ["<strong>", "</strong>", "<a href=\"https://solpbc.org/privacy#encrypted-backup\">", "</a>"])}</p>
<p>${termsText('account.terms.n1yourrecoverykeyistheonlykey2whenyousetupbacku', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1asecondcopyunlessyouchooseotherwise2anencrypt', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1afteryoursubscriptionlapseswekeepyourencrypte', ["<strong>", "</strong>"])}</p>
<ul>
  <li>${esc(t('account.terms.theoperatedstoragekeepsrunninguntilyoursubscri'))}</li>
  <li>${esc(t('account.terms.yourencryptedblocksthenstayinour'))}</li>
  <li>${esc(t('account.terms.after30daysoperatedcopyispermanently'))}</li>
</ul>
<p>${esc(t('account.terms.youcanalsodeleteoperatedcopyyourself'))}</p>
<p>${termsText('account.terms.n1fairusespecifically2theoperatedtierisforbacki', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1alimitspecifictothisservice2theoperatedcopyis', ["<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<h2>${esc(t('account.terms.n13confidentialprocessing'))}</h2>
<p>${termsText('account.terms.n1whatitis2anaimodelsolpbcrunsonconfidentialgpu', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1youneverhavetopayus2thisiscapacitynotagateyou', ["<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1amodelsolpbcrunsitself2ourownmodelweightsserv', ["<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1itsprotecteddifferentlyfromourotherthreeservi', ["<strong>", "</strong>", "<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1yourjournalchecksbeforeitsends2beforeanything', ["<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1thehardwareismicrosoftazuresandazurecantseein', ["<strong>", "</strong>"])}</p>
<p><strong>${esc(t('account.terms.speech'))}</strong>${esc(t('account.terms.whentheaudioswitchisonyourjournalsendsspeechfo'))}<code>${esc(`parakeet-tdt-0.6b-v3`)}</code>${esc(t('account.terms.createdbynvidiaandusedunder'))}<a href="https://creativecommons.org/licenses/by/4.0/">${esc(t('account.terms.ccby40'))}</a>${esc(t('account.terms.thesamemodelgenerationyourowndevicerunstheswit'))}<strong>${esc(t('account.terms.onbydefault'))}</strong>${esc(t('account.terms.wheneverconfidentialprocessingisinuseandthepag'))}</p>
<p>${termsText('account.terms.n1youruseismeteredinsidethecontainer2theservice', ["<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1accessandwhatyourplanincludes2accessisbysubsc', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1turningitoff2turnitofffromthejournalanytimean', ["<strong>", "</strong>", "<em>", "</em>"])}</p>
<p>${termsText('account.terms.n1whenitstops2cancelorletitlapseandconfidential', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1whatwekeep2runningthisserviceinvolvesafewdiff', ["<strong>", "</strong>"])}</p>
<ul>
  <li>${termsText('account.terms.n1whatyousendthemodel2thetextandimagesyourjourn', ["<strong>", "</strong>", "<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1nothingyousendisusedtotrainanything2notourmod', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1accessrecordsnotcontent2toruntheserviceandcon', ["<strong>", "</strong>", "<a href=\"https://solpbc.org/privacy#confidential-processing\">", "</a>"])}</li>
  <li>${termsText('account.terms.n1insidethecontainer2theservicekeepsthecountofh', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1wekeepnoconnectionmetadataforthisservice2beyo', ["<strong>", "</strong>"])}</li>
</ul>
<p>${termsText('account.terms.n1whatthemodelproducesisnotadviceandnobodycheck', ["<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1fairusespecifically2confidentialprocessingisf', ["<strong>", "</strong>"])}</p>
<h2>${esc(t('account.terms.n14solstoneme'))}</h2>
<p>${termsText('account.terms.n1whatitis2anaddressontheinternetforyourjournal', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1youneverhavetopayus2yourjournaldoesntneedsolp', ["<strong>", "</strong>", "<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1blindbyconstructionandthisrelayholdsnostateab', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1yourjournalsaddressandthepartofitthatisperman', ["<strong>", "</strong>", "<strong>", "</strong>", "<a href=\"https://solpbc.org/privacy#solstone-me\">", "</a>"])}</p>
<p>${termsText('account.terms.n1youraddressisneveranyoneelses2anaddressoncemi', ["<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1whateachagentmayseeisyourstosetandwerenotinit', ["<strong>", "</strong>", "<strong>", "</strong>", "<strong>", "</strong>", "<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1theagentisyoursandthecompanybehinditisntours2', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1whatthisrelayandourcontrolplanehandleandwhatw', ["<strong>", "</strong>", "<strong>", "</strong>", "<a href=\"https://solpbc.org/privacy#solstone-me\">", "</a>"])}</p>
<p>${termsText('account.terms.n1turningitoffandhowquicklythattakeseffect2turn', ["<strong>", "</strong>", "<em>", "</em>"])}</p>
<p>${termsText('account.terms.n1ajournalthatisntreachableisordinary2yourjourn', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1fairusespecifically2thisisforyourownagentsrea', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1whenitstops2cancelorletitlapseandthesolstonem', ["<strong>", "</strong>"])}</p>
<h2>${esc(t('account.terms.n15notifications'))}</h2>
<p>${termsText('account.terms.n1whatitis2notificationsarebuiltintothesolstone', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1onthedeviceandonyourphone2aheadsupcanbealocal', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1thehopforiphone2reachinganiphoneneedsahopbeca', ["<strong>", "</strong>", "<a href=\"https://solpbc.org/privacy#notifications\">", "</a>"])}</p>
<p>${termsText('account.terms.n1notatrackingsurface2noanalyticsnobehavioralpr', ["<strong>", "</strong>"])}</p>
<p>${termsText('account.terms.n1turningitoff2turnnotificationsoffonanydevicea', ["<strong>", "</strong>"])}</p>
<h2>${esc(t('account.terms.n16scoutprogram'))}</h2>
<p>${esc(t('account.terms.scoutissolpbcstesterprogram'))}</p>
<ul>
  <li>${termsText('account.terms.n1complimentarymeanscomplimentary2whileyoureana', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1itcanend2scoutstatusisourstograntandourstoend', ["<strong>", "</strong>"])}</li>
  <li>${termsText('account.terms.n1whatwekeep2yourapplicationyouracknowledgmento', ["<strong>", "</strong>", "<a href=\"https://solpbc.org/privacy#scout\">", "</a>"])}</li>
</ul>
<hr>
<p class="meta"><em>${esc(t('account.terms.thesetermsdescribeservicessolpbcruns'))}</em></p>
<hr>
<h2>${esc(t('account.terms.forconsumersinfrancearticlesl2151tol2153andl24'))}</h2>
<p><strong>${esc(t('account.terms.articlel2151'))}</strong></p>
<p>${esc(t('account.terms.pourlescontratsdeprestationsdeservicesconclusp'))}</p>
<p>${esc(t('account.terms.lorsquecetteinformationneluiapaseteadresseecon'))}</p>
<p>${esc(t('account.terms.lesavanceseffectueesapresladernieredatederecon'))}</p>
<p>${esc(t('account.terms.lesdispositionsdupresentarticlesappliquentsans'))}</p>
<p>${esc(t('account.terms.parexceptionaupremieralineadupresentarticlepou'))}</p>
<p><strong>${esc(t('account.terms.articlel21511'))}</strong></p>
<p>${esc(t('account.terms.lorsquuncontrataeteconcluparvoieelectroniqueou'))}</p>
<p>${esc(t('account.terms.aceteffetleprofessionnelmetaladispositionducon'))}</p>
<p>${esc(t('account.terms.undecretfixenotammentlesmodalitestechniquesden'))}</p>
<p><strong>${esc(t('account.terms.articlel2152'))}</strong></p>
<p>${esc(t('account.terms.lesdispositionsdupresentchapitrealexceptiondel'))}</p>
<p><strong>${esc(t('account.terms.articlel2153'))}</strong></p>
<p>${esc(t('account.terms.lesdispositionsdupresentchapitresontegalementa'))}</p>
<p><strong>${esc(t('account.terms.articlel2413'))}</strong></p>
<p>${esc(t('account.terms.lorsqueleprofessionnelnapasprocedeauremboursem'))}</p>`,
  });
}

// Shown when the CSRF synchronizer token is missing or doesn't match, the
// rare residual case once the body-carried token defeats the common
// email-security link/header rewriting. Actionable and deliberately
// state-free (no host or account input) so the body is byte-identical on
// every token failure and leaks no enumeration signal.
export function renderForbidden() {
  return layout({
    title: t('account.signin.wecouldntverifythissignin'),
    body: `${brandbar()}
<div class="card">
  <h1>${htmlText('account.signin.wecouldntverifythissignin')}</h1>
  <p>${htmlText('account.signin.youremailsecuritymayhavemodifiedlink')}</p>
  <p>${htmlText('account.portal.tocontinueopen')} <strong>https://services.solstone.app</strong> ${htmlText('account.portal.directlyinanewbrowsertabandrequestanewcode')}</p>
  <p><a href="https://services.solstone.app">${htmlText('account.signin.openservicessolstoneapp')}</a></p>
</div>`,
  });
}

export function renderNotFound() {
  return layout({
    title: t('account.signin.notfound'),
    body: `${brandbar()}
<h1>${htmlText('account.signin.notfound')}</h1>
<p class="lead">${htmlText('account.signin.nothingatthisaddress')}</p>
<a class="btn secondary" href="/">${htmlText('account.signin.backhome')}</a>`,
  });
}

export function formatRelativeTime(tsMs, nowMs) {
  if (tsMs == null) return '—';
  const ts = Number(tsMs);
  const now = Number(nowMs);
  if (!Number.isFinite(ts) || !Number.isFinite(now)) return '—';
  const diff = Math.max(0, now - ts);
  if (diff < 60_000) return t('account.portal.justnow');
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return countText('account.portal.minuteago', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return countText('account.portal.hourago', { count: hours });
  if (hours < 48) return t('account.portal.yesterday');
  const days = Math.floor(hours / 24);
  if (days >= 30) return new Date(ts).toISOString().slice(0, 10);
  return countText('account.portal.dayago', { count: days });
}

export function formatByteSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return t('account.portal.bytes2', { value1: Math.floor(value) });
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
  return t('account.portal.lastbackupsizeenabled2', { relativeTime: formatRelativeTime(candidate.lastBackupMs, Date.now()), size: formatByteSize(candidate.sizeBytes), date: formatDate(candidate.createdAt) });
}

function restoreCandidateLines(candidate) {
  return `<span style="display:block">${journalIdLabel(candidate.instanceId)}</span>${esc(restoreCandidateDetail(candidate))}`;
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

// "$20" or "$2.49": Stripe's unit amount in cents, as the renewal notices print it.
function formatPlanPrice(plan) {
  const cents = plan.unitAmount;
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

// A checkout plan's price line, "$20 / year" or "$2.49 / month", from its unit amount in cents.
function planTitle(row) {
  return `${formatPlanPrice(row)} / ${row.plan === 'annual' ? 'year' : 'month'}`;
}

// The key facts shown before checkout, all together and apart from the rest of the page, beside
// the start-now box. A page offering two plans shows each plan's facts, then the lines no plan
// changes once. Nothing here renders while the subscription rules are off.
function keyFactsHtml(line) {
  return esc(line)
    .replaceAll(/\[(services\.solstone\.app\/terms)\]\((https:\/\/services\.solstone\.app\/terms)\)/g, '<a href="$2">$1</a>')
    .replaceAll(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replaceAll(/\*([^*\n]+)\*/g, '<em>$1</em>');
}

function keyFactsList(lines) {
  return `<ul>
        ${lines.map((line) => `<li>${keyFactsHtml(line)}</li>`).join('\n        ')}
      </ul>`;
}

function keyInformation(rows, service) {
  const planValues = (r) => ({
    service,
    price: formatPlanPrice(r),
    monthly_equivalent: formatPlanPrice({ unitAmount: Math.round(r.unitAmount / 12) }),
  });
  const interval = (r) => (r.plan === 'annual' ? 'year' : 'month');
  const body = rows.length === 1
    ? `<div data-key-info-plan="${escAttr(rows[0].plan)}">
      ${keyFactsList(keyFactsLines({ interval: interval(rows[0]), values: planValues(rows[0]) }))}
    </div>`
    : `${rows.map((r) => `<div data-key-info-plan="${escAttr(r.plan)}">
      <p><strong>${esc(planTitle(r))}</strong></p>
      ${keyFactsList(keyFactsPlanLines({ interval: interval(r), values: planValues(r) }))}
    </div>`).join('\n    ')}
    <hr>
    <div data-key-info-shared>
      ${keyFactsList(KEY_FACTS_SHARED_LINES)}
    </div>`;
  return `<section class="card" data-key-info style="margin:0 0 16px">
    <h2>${esc(KEY_FACTS_PAGE_HEADING)}</h2>
    ${body}
  </section>
    `;
}

// The lead of a service page's billing line: when it renews and at what price, or, once it is
// set to stop, how far it is paid.
function renewalLead({ paidThrough, cancelPending, plan }) {
  if (!paidThrough) return '';
  if (cancelPending) return t('account.portal.paidthrough2', { date: esc(paidThrough) });
  return plan
    ? t('account.portal.renewsonat', { date: esc(paidThrough), price: formatPlanPrice(plan), tax: taxWords(plan) })
    : t('account.portal.renewson', { date: esc(paidThrough) });
}

// A price set with tax included says so; one set before that says tax may be added.
function taxWords(plan) {
  return plan.taxIncluded ? t('account.renewal.taxincluded') : t('account.renewal.plusanysalestax');
}

// The checkout choices of a service page. With the withdrawal door on, the plans share one
// form carrying the unticked "start my service now" box, each plan its own submit button;
// with it off, each plan is its own form, as before.
function checkoutGroup({ csrf, rows, service, startNowBox = false, keyInfo = false, action = '/billing/checkout', restoreIntent = false }) {
  const info = keyInfo ? keyInformation(rows, service) : '';
  if (!startNowBox) {
    return `${info}<div class="group">
    ${rows.map((r) => billingCheckoutRow({ csrf, ...r, title: planTitle(r), action, restoreIntent })).join('\n    ')}
  </div>`;
  }
  return `<form method="post" action="${escAttr(action)}">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    ${restoreIntent ? '<input type="hidden" name="intent" value="restore">' : ''}
    ${info}${startNowField()}
    <div class="group">
    ${rows.map((r) => `<div class="row" style="cursor:default">
  <div class="body">
    <div class="title">${esc(planTitle(r))}</div>
  </div>
  <div class="trail"><button class="${r.primary ? 'btn primary' : 'btn secondary'}" type="submit" name="plan" value="${escAttr(r.plan)}">${esc(r.buttonText)}</button></div>
</div>`).join('\n    ')}
    </div>
  </form>`;
}

// PLACEHOLDER pending the approved wording: the drafted words for the door, its page, the confirm
// button and the start-now box. Nothing here renders while the withdrawal door is off.
export const WITHDRAWAL_DOOR_LABEL = t('account.portal.withdrawfromcontracthere2');
export const WITHDRAWAL_CONFIRM_LABEL = t('account.portal.confirmwithdrawal');
export const BACKUP_WITHDRAWAL_RETENTION = t('account.portal.wekeepyourencryptedbackupcopyfor');
const START_NOW_LEAD = t('account.portal.startmyservicenow');
const START_NOW_BODY = t('account.portal.imaskingsolpbcstartthis');

function startNowField() {
  return `<label class="ack">
      <input type="checkbox" name="start_now" value="yes" required>
      <span><strong>${esc(START_NOW_LEAD)}</strong> ${esc(START_NOW_BODY)}</span>
    </label>`;
}

// The door. It restates the rule with its date only while that can't read as already passed.
function withdrawalDoor(withdrawal, { serviceName = '', service = '' } = {}) {
  if (!withdrawal) return '';
  const what = serviceName ? `${serviceName}: ` : '';
  const date = withdrawal.purchasedAt != null ? formatLongDate(withdrawal.purchasedAt) : '';
  let lead = t('account.withdrawal.youcanstillwithdrawhereforafullrefund', { what });
  if (date && withdrawal.renewed) lead = t('account.withdrawal.youcanwithdrawuntiltheendofthe14thdayafterthed', { what, date });
  else if (date) lead = t('account.withdrawal.youcanwithdrawuntiltheendofthe14thdayafterfora', { what, date });
  return `<div class="card" style="margin-top:16px">
  <p>${esc(lead)}</p>
  ${service === 'spb_hosted' ? `<p class="disclosure">${esc(BACKUP_WITHDRAWAL_RETENTION)}</p>` : ''}
  <a class="btn secondary" href="${escAttr(withdrawal.path)}">${esc(WITHDRAWAL_DOOR_LABEL)}</a>
</div>`;
}

// `flash.renewed` is when a withdrawn renewal was paid, in Unix seconds, given only for a renewed
// annual year with the subscription rules on.
function withdrawalFlashMessages(flash, serviceName) {
  const messages = [];
  const renewedOn = /^[1-9][0-9]*$/.test(flash.renewed || '') ? formatLongDate(Number(flash.renewed)) : '';
  const refunding = renewedOn ? t('account.withdrawal.wererefundingeverythingyoupaidforitsrenewalon', { date: renewedOn }) : t('account.withdrawal.wererefundingeverythingyoupaidforit');
  if (flash.checkout === 'start_now') messages.push(t('account.withdrawal.tickstartmyservicenowcontinue'));
  if (flash.withdrawal === 'done') messages.push(t('account.withdrawal.wereceivedyourwithdrawalhasstoppedandwontrenew', { serviceName, refunding }));
  if (flash.withdrawal === 'done_unsent') messages.push(t('account.withdrawal.wereceivedyourwithdrawalhasstoppedandwontrenew2', { serviceName, refunding }));
  if (flash.withdrawal === 'missing') messages.push(t('account.withdrawal.thereisnosubscriptionherewithdrawfrom'));
  return messages.map((message) => `<p class="notice">${esc(message)}</p>`).join('');
}

// The owner's own withdrawal page: who is signed in, the subscription, where the acknowledgement
// goes (all read-only, already known from the sign-in), one line on what happens, and one confirm
// button. Nothing else goes on it.
// `purchasedAt` is when the window opened: the purchase or, in a renewed annual year, when the
// renewal was paid, and then `boughtAt` is the purchase.
export function renderWithdrawal({ def, menu, csrf, primaryEmail, state, submittedAt = null, purchasedAt = null, renewed = false, boughtAt = null, monthsLeft = 0, ruleShown = false, plan = null, statement = '' }) {
  const title = t('account.withdrawal.withdrawfromyoursubscription2', { service: def.name });
  const page = (content) => layout({
    title,
    body: `${topbar(menu)}
<a class="back" href="${escAttr(def.path)}">${BACK_SVG} ${htmlText('account.withdrawal.back')}</a>
<div class="pagehead">
  <h1>${esc(title)}</h1>
</div>
${content}`,
  });
  const retention = def.service === 'spb_hosted' ? `<p class="disclosure">${esc(BACKUP_WITHDRAWAL_RETENTION)}</p>` : '';
  const submitted = submittedAt != null ? formatMomentUtc(Math.floor(submittedAt / 1000)) : '';

  if (state === 'none') {
    return page(`<p class="lead">${htmlText('account.withdrawal.thereisnopaid')} ${esc(def.name)} ${htmlText('account.withdrawal.subscriptiononthissignintowithdrawfrom')}</p>`);
  }
  if (state === 'finishing') {
    return page(`<p class="lead">${esc(t('account.withdrawal.wereceivedyourwithdrawalonandwerefinishingityo', { date: submitted }))}</p>`);
  }
  if (state === 'failed') {
    return page(`<p class="lead">${esc(t('account.withdrawal.wereceivedyourwithdrawalonfinishingithitaprobl', { date: submitted }))}</p>`);
  }
  if (state === 'unavailable') {
    return page(`<p class="lead">${esc(t('account.withdrawal.yoursubscriptiondetailsdidntloadso'))}</p>`);
  }
  if (state === 'closed' && renewed) {
    // With no whole month left to refund, the refund clause drops, as every refund line does.
    const refund = monthsLeft > 0 ? t('account.withdrawal.andwerefundthewholemonthsleft') : '';
    const closed = t('account.withdrawal.the14daystowithdrawfromsrenewalonareoveryoucan', { service: def.name, date: formatLongDate(purchasedAt), refund });
    return page(`<p class="lead">${esc(closed)}</p>`);
  }
  if (state === 'closed') {
    return page(`<p class="lead">${esc(t('account.withdrawal.the14daystowithdrawfromthissubscriptionboughto', { service: def.name, date: formatLongDate(purchasedAt) }))}</p>`);
  }
  if (!primaryEmail) {
    return page(`<p class="lead">${esc(t('account.withdrawal.thissigninhasnoemailaddress'))}</p>`);
  }
  const until = ruleShown ? t('account.withdrawal.youhaveuntiltheendofthe14thdayafter', { date: formatLongDate(purchasedAt) }) : '';
  const lead = renewed
    ? t('account.withdrawal.ifyouwithdrawstopstodayandwerefundeverythingyo', { service: def.name, date: formatLongDate(purchasedAt), until })
    : t('account.withdrawal.ifyouwithdrawstopstodayandwerefundeverythingyo2', { service: def.name, until });
  const subscriptionLine = t('account.withdrawal.subscriptioneveryboughton2', { service: def.name, price: formatPlanPrice(plan), interval: plan.interval, date: formatLongDate(renewed ? boughtAt : purchasedAt) });
  return page(`<div class="card">
  <p class="signed-in">${esc(t('account.withdrawal.signedinas2', { primaryEmail }))}</p>
  <p>${esc(subscriptionLine)}</p>
  <p>${esc(t('account.withdrawal.wellsendtheacknowledgementto', { primaryEmail }))}</p>
  <p>${esc(lead)}</p>
  ${retention}
  <form method="post" action="${escAttr(`/billing/withdraw/${def.slug}`)}">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="statement" value="${escAttr(statement)}">
    <div class="btn-row" style="margin-top:16px">
      <button class="btn danger" type="submit">${esc(WITHDRAWAL_CONFIRM_LABEL)}</button>
    </div>
  </form>
</div>`);
}

// The cancel function's link, its page, its summary and its done page, in the approved wording.
// Nothing here renders while the subscription rules are off. The values arrive formatted.
export const CANCEL_CONTRACT_LABEL = t('account.cancel.cancelcontractshere');
export const CANCEL_NOW_LABEL = t('account.cancel.cancelnow');
const monthsWord = (months) => (months === 1 ? t('account.portal.month') : t('account.portal.months'));
const CANCEL_WORDS = {
  title: (service) => t('account.portal.cancelyoursubscription', { service }),
  signedInAs: (email) => t('account.portal.signedinas', { email }),
  subscription: (v) => t('account.portal.subscriptioneveryboughton', { serviceName: v.serviceName, price: v.price, interval: v.interval, purchaseDate: v.purchaseDate }),
  name: t('account.portal.yournameoptionalitgoesonlyintoyourconfirmation'),
  typeCancel: t('account.portal.cancel'),
  typeCause: t('account.portal.cancelforaseriousreasonsuchassomethingwedidwro'),
  reason: t('account.portal.tellusthereason'),
  earliest: (date) => t('account.portal.itendsontheearliestitcan', { date }),
  earliestCause: (date) => t('account.portal.itendsontheearliestanordinarycancelcan', { date }),
  yearEnd: (date) => t('account.portal.attheendofthisplanyear', { date }),
  today: t('account.portal.today'),
  keepsFirst: (service) => t('account.portal.keepsworkinguntilthentheendoftheperiodyouvepai', { service }),
  keepsRenewed: (service, months, amount) => t('account.portal.keepsworkinguntilthenandwerefundwholethesamewa', { service, months, monthsLabel: monthsWord(months), amount }),
  endsToday: t('account.portal.itendstodaywellansweryourreasonandwhetherweref'),
  endsTodayRefund: (amount) => t('account.portal.werefundthewholemonthslefteitherway', { amount }),
  next: t('account.portal.cancelcontinue'),
  summary: (d) => [
    t('account.portal.yourecancelingevery', { serviceName: d.serviceName, price: d.price, interval: d.interval }),
    d.reason != null ? t('account.portal.foraseriousreason', { reason: d.reason }) : '',
    t('account.portal.itendson', { endDate: d.endDate }),
    d.refund ? t('account.portal.werefund', { refund: d.refund }) : '',
    t('account.portal.wellsendtheconfirmationto', { email: d.email }),
  ].filter(Boolean).join(' '),
  back: t('account.portal.back'),
  received: (moment) => t('account.portal.wereceivedyourcancellationon', { moment }),
  emailed: t('account.portal.weveemailedyouacopy'),
  save: t('account.portal.savethispage'),
  // Not in the approved wording: the dark build's short states for a page that can't offer the
  // cancel, kept as they were for review before the switch turns on.
  noEmail: t('account.cancel.thissigninhasnoemailaddressto'),
  pending: (name, date) => `${name}: already set to end on ${date}.`,
  unavailable: (name) => `${name}: its details didn't load. reload to try again.`,
  unavailableError: t('account.cancel.yoursubscriptiondetailsdidntloadtryagain'),
};

// A cancel for a serious reason opens a support request carrying its type and the summary line.
export function cancelCauseTicket(declaration) {
  return { subject: CANCEL_WORDS.typeCause, description: CANCEL_WORDS.summary(declaration) };
}

// Under the subscription rules (a cancel-contract href is present) the billing portal can no longer
// lift a cancel, so the "keep it" sentence is dropped; without them it stays as it was.
function keepItOn(rulesCancel, sentence) {
  return rulesCancel ? '' : sentence;
}

// "cancel contracts here", and beside it, inside a withdrawal window whose date can still be
// shown, the pointer to the door. '' with the subscription rules off.
function cancelContractLink(href, withdrawal = null, serviceName = '') {
  if (!href) return '';
  const pointer = withdrawalPointer(withdrawal, serviceName);
  return `\n${pointer ? `<p class="disclosure" style="margin-top:24px">${esc(pointer)}</p>\n` : ''}<p style="margin-top:${pointer ? '8' : '24'}px"><a class="btn secondary" href="${escAttr(href)}">${esc(CANCEL_CONTRACT_LABEL)}</a></p>`;
}

// The billing page's own "cancel contracts here" for one paid service, with its pointer.
function billingCancelContract(entry) {
  if (!entry.cancelContract) return '';
  const pointer = withdrawalPointer(entry.withdrawal, entry.name);
  return `<div class="card" style="margin-top:16px">
  <h2>${esc(entry.name)}</h2>
  ${pointer ? `<p>${esc(pointer)}</p>\n  ` : ''}<a class="btn secondary" href="${escAttr(entry.cancelContract)}">${esc(CANCEL_CONTRACT_LABEL)}</a>
</div>`;
}

// Inside a withdrawal window, what each of the two routes does: the door, and the cancel.
function withdrawalPointer(withdrawal, serviceName) {
  if (withdrawal?.purchasedAt == null || !serviceName || withdrawal.cancelPending) return '';
  const date = formatLongDate(withdrawal.purchasedAt);
  if (!withdrawal.renewed) {
    return t('account.withdrawal.youcanstillwithdrawuntiltheendofthe14thdayafte', { date, serviceName });
  }
  if (!Number.isInteger(withdrawal.renewalPaid) || withdrawal.renewalPaid <= 0) return '';
  return t('account.withdrawal.youcanstillwithdrawfromthisrenewaluntiltheendo', { date, serviceName, price: formatPlanPrice({ unitAmount: withdrawal.renewalPaid }) });
}

// The type of cancel decides what shows without script: the reason field, the earliest line's
// wording and the "today" option belong to a cancel for a serious reason.
const CANCEL_PAGE_STYLE = `<style>
#cc-type-cancel:checked ~ .cc-if-cause, #cc-type-cancel:checked ~ * .cc-if-cause { display: none; }
#cc-type-cause:checked ~ * .cc-if-ordinary { display: none; }
.cc-back { background: none; border: 0; padding: 0; font: inherit; cursor: pointer; }
.cc-note { margin: -6px 0 14px 30px; color: var(--ink-soft); }
@media print { .back, .cc-print { display: none; } }
</style>`;

function cancelContractPage(menu, title, content, { back = '', notice = '' } = {}) {
  return layout({
    title,
    body: `${topbar(menu)}
${CANCEL_PAGE_STYLE}
${back}
${notice ? `<p class="notice">${esc(notice)}</p>` : ''}
<div class="pagehead">
  <h1>${esc(title)}</h1>
</div>
${content}`,
  });
}

function cancelBackLink(href) {
  return `<a class="back" href="${escAttr(href)}">${BACK_SVG} ${esc(CANCEL_WORDS.back)}</a>`;
}

// The page for one paid subscription: who is signed in, the subscription, an optional name, the
// type of cancel, when it ends, and continue. Or, when it can't be offered, why.
export function renderCancelContract({ menu, csrf, primaryEmail, choice, view = null, input = {}, focusReason = false, error = '' }) {
  const def = choice.def;
  const page = (content) => cancelContractPage(menu, CANCEL_WORDS.title(def.name), content, {
    back: cancelBackLink(def.path),
    notice: error === 'unavailable' ? CANCEL_WORDS.unavailableError : '',
  });
  if (!primaryEmail) return page(`<p class="lead">${esc(CANCEL_WORDS.noEmail)}</p>`);
  if (!choice.offered) {
    return page(`<div class="card">
  <p>${esc(choice.unavailable ? CANCEL_WORDS.unavailable(def.name) : CANCEL_WORDS.pending(def.name, choice.endDate))}</p>
</div>`);
  }
  const cause = input.type === 'cause';
  const end = cause && input.end === 'today' && !view.earliestToday ? 'today' : (view.yearEndDate && input.end === 'period_end' ? 'period_end' : 'earliest');
  const radio = (value, extra = '') => `<input type="radio" name="end" value="${value}"${end === value ? ' checked' : ''}${extra}>`;
  const earliestNote = view.refund
    ? CANCEL_WORDS.keepsRenewed(def.name, view.refundMonths, view.refund)
    : (view.earliestIsPeriodEnd ? CANCEL_WORDS.keepsFirst(def.name) : '');
  const todayNote = [CANCEL_WORDS.endsToday, view.refund ? CANCEL_WORDS.endsTodayRefund(view.refund) : ''].filter(Boolean).join(' ');
  return page(`<div class="card">
  <p class="signed-in">${esc(CANCEL_WORDS.signedInAs(primaryEmail))}</p>
  <p>${esc(CANCEL_WORDS.subscription(view))}</p>
  <form method="post" action="${escAttr(`${CANCEL_CONTRACT_PATH_HTML}/review`)}">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="service" value="${escAttr(def.slug)}">
    <label for="cancel-name">${esc(CANCEL_WORDS.name)}</label>
    <input id="cancel-name" type="text" name="name" value="${escAttr(input.name || '')}" maxlength="200" autocomplete="name">
    <input type="radio" id="cc-type-cancel" name="type" value="cancel"${cause ? '' : ' checked'}>
    <label for="cc-type-cancel">${esc(CANCEL_WORDS.typeCancel)}</label>
    <input type="radio" id="cc-type-cause" name="type" value="cause"${cause ? ' checked' : ''}>
    <label for="cc-type-cause">${esc(CANCEL_WORDS.typeCause)}</label>
    <div class="cc-if-cause">
      <label for="cancel-reason">${esc(CANCEL_WORDS.reason)}</label>
      <textarea id="cancel-reason" name="reason" rows="3" maxlength="2000"${focusReason ? ' autofocus' : ''}>${esc(input.reason || '')}</textarea>
    </div>
    <div>
      <label class="ack">
        ${radio('earliest')}
        <span><span class="cc-if-ordinary">${esc(CANCEL_WORDS.earliest(view.earliestDate))}</span><span class="cc-if-cause">${esc(CANCEL_WORDS.earliestCause(view.earliestDate))}</span></span>
      </label>
      ${earliestNote ? `<p class="cc-note">${esc(earliestNote)}</p>` : ''}
      ${view.yearEndDate ? `<label class="ack">
        ${radio('period_end')}
        <span>${esc(CANCEL_WORDS.yearEnd(view.yearEndDate))}</span>
      </label>` : ''}
      ${view.earliestToday ? '' : `<label class="ack cc-if-cause">
        ${radio('today')}
        <span>${esc(CANCEL_WORDS.today)}</span>
      </label>
      <p class="cc-note cc-if-cause">${esc(todayNote)}</p>`}
    </div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn primary" type="submit">${esc(CANCEL_WORDS.next)}</button>
    </div>
  </form>
</div>`);
}

// The summary: the one line of what is being sent, a plain way back that keeps what was entered,
// and one cancel button. Nothing else.
export function renderCancelContractReview({ menu, csrf, statement, input, declaration }) {
  const back = `<form method="post" action="${escAttr(CANCEL_CONTRACT_PATH_HTML)}">
  <input type="hidden" name="csrf" value="${escAttr(csrf)}">
  <input type="hidden" name="service" value="${escAttr(input.slug)}">
  <input type="hidden" name="name" value="${escAttr(input.name)}">
  <input type="hidden" name="type" value="${escAttr(input.type)}">
  <input type="hidden" name="reason" value="${escAttr(input.reason)}">
  <input type="hidden" name="end" value="${escAttr(input.end)}">
  <button class="back cc-back" type="submit">${BACK_SVG} ${esc(CANCEL_WORDS.back)}</button>
</form>`;
  return cancelContractPage(menu, CANCEL_WORDS.title(declaration.serviceName), `<div class="card">
  <p>${esc(CANCEL_WORDS.summary(declaration))}</p>
  <form method="post" action="${escAttr(`${CANCEL_CONTRACT_PATH_HTML}/confirm`)}">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="statement" value="${escAttr(statement)}">
    <div class="btn-row" style="margin-top:16px">
      <button class="btn danger" type="submit">${esc(CANCEL_NOW_LABEL)}</button>
    </div>
  </form>
</div>`, { back });
}

// After the press: when it was received, the summary line again, whether its email has gone, and
// a way to save the page.
export function renderCancelContractDone({ menu, declaration, emailed, backHref }) {
  return cancelContractPage(menu, CANCEL_WORDS.title(declaration.serviceName), `<div class="card">
  <p class="lead">${esc(CANCEL_WORDS.received(declaration.submitted))}</p>
  <p>${esc(CANCEL_WORDS.summary(declaration))}</p>
  ${emailed ? `<p>${esc(CANCEL_WORDS.emailed)}</p>` : ''}
  <div class="btn-row cc-print" style="margin-top:16px">
    <button class="btn secondary" type="button" onclick="window.print()">${esc(CANCEL_WORDS.save)}</button>
  </div>
</div>`, { back: cancelBackLink(backHref) });
}

function billingPortalForm({ csrf, buttonText = t('account.billing.managebilling'), buttonClass = 'btn primary', action = '/billing/portal' }) {
  return `<form method="post" action="${escAttr(action)}">
  <input type="hidden" name="csrf" value="${escAttr(csrf)}">
  <button class="${buttonClass}" type="submit">${esc(buttonText)}</button>
</form>`;
}

function billingFlashMessages(flash) {
  const messages = [];
  if (flash.checkout === 'invalid') messages.push(t('account.billing.chooseyearlyormonthlybilling'));
  if (flash.checkout === 'email') messages.push(t('account.billing.billingcouldntstarttryagain'));
  if (flash.checkout === 'error') messages.push(t('account.billing.billingcouldntstarttryagain'));
  if (flash.checkout === 'comped') messages.push(t('account.billing.yourealreadycoveredfreeasscout'));
  if (flash.billing === 'missing') messages.push(t('account.billing.billingmanagementisavailableafterhostingstarts'));
  if (flash.billing === 'error') messages.push(t('account.billing.billingmanagementdidntopentryagain'));
  return messages.map((message) => `<p class="notice">${esc(message)}</p>`).join('');
}

function smeBillingFlashMessages(flash) {
  const messages = [];
  if (flash.checkout === 'success') messages.push(t('account.billing.paymentreceiveditcantakemomentshow'));
  if (flash.checkout === 'cancel') messages.push(t('account.billing.nochargemade'));
  if (flash.checkout === 'ack') messages.push(t('account.billing.confirmyouunderstandbeforecontinuing'));
  if (flash.checkout === 'email') messages.push(t('account.billing.billingneedsanemailaddressonyour'));
  if (['invalid', 'error'].includes(flash.checkout)) messages.push(t('account.billing.billingcouldntstarttryagain'));
  if (flash.checkout === 'comped') messages.push(t('account.billing.yourealreadycoveredfreeasscout'));
  if (flash.billing === 'missing') messages.push(t('account.billing.billingmanagementisavailableoncepaymenthas'));
  if (flash.billing === 'error') messages.push(t('account.billing.billingmanagementdidntopentryagain'));
  return messages.map((message) => `<p class="notice">${esc(message)}</p>`).join('');
}

function spbBillingFlashMessages(flash) {
  const messages = [];
  if (flash.checkout === 'success') messages.push(t('account.billing.paymentreceiveditcantakemomentshow'));
  if (flash.checkout === 'cancel') messages.push(t('account.billing.nochargemadeyoucanturnon'));
  if (flash.checkout === 'invalid') messages.push(t('account.billing.chooseyearlyormonthlybilling'));
  if (flash.checkout === 'email') messages.push(t('account.billing.billingcouldntstarttryagain'));
  if (flash.checkout === 'error') messages.push(t('account.billing.billingcouldntstarttryagain'));
  if (flash.checkout === 'comped') messages.push(t('account.billing.yourealreadycoveredfreeasscout'));
  if (flash.billing === 'missing') messages.push(t('account.billing.billingmanagementisavailableafterencryptedbackup'));
  if (flash.billing === 'error') messages.push(t('account.billing.billingmanagementdidntopentryagain'));
  return messages.map((message) => `<p class="notice">${esc(message)}</p>`).join('');
}

function flashMessages(flash) {
  const messages = [];
  if (flash.apply === 'ok') messages.push(t('account.portal.scoutrequestreceived'));
  if (flash.apply === 'acked') messages.push(t('account.portal.scoutacknowledgementsaved'));
  if (flash.apply === 'no_ack') messages.push(t('account.portal.confirmyouunderstandbeforecontinuing'));
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

// A deadline an owner acts against, with its time and zone: 2026-10-04 16:52 UTC.
export function formatDeadline(tsMs) {
  const ts = Number(tsMs);
  if (!Number.isFinite(ts)) return '';
  const iso = new Date(ts).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
