import {
  BACK_SVG,
  esc,
  escAttr,
  formatDate,
  formatRelativeTime,
  layout,
  topbar,
} from './html.js';
import { SUPPORT_FORMS_JS } from './inline/support-forms.js';

const SUPPORT_STATUS_LABELS = {
  open: 'open',
  'in-progress': 'in progress',
  waiting: 'waiting on you',
  proposed: 'proposal ready',
  resolved: 'resolved',
};

export function renderSupportList({ sections, nowMs = Date.now(), csrf = '' }) {
  return supportLayout('your support', `${supportTopbar()}
<a class="back" href="/">${BACK_SVG} your services</a>
<h1>your support</h1>
${renderActiveSection(sections.active, nowMs)}
${renderClosedSection(sections.closed)}
${renderCreateSection(sections.create, csrf)}`);
}

export function renderSupportDetail({ request, messages = [], attachments = [], csrf = '', nowMs = Date.now(), notices = [], forms = {}, outcome = null }) {
  const messageRows = messages.map((message) => `<div class="row" style="cursor:default">
  <div class="body"><div class="title">${esc(message.authorLabel || 'unknown sender')}</div>
  <p>${esc(message.content || '')}</p><div class="meta">${esc(formatRelativeTime(message.createdAtMs, nowMs))}</div></div>
</div>${message.authorWarning ? '<p class="notice">some sender details could not be read.</p>' : ''}`).join('');
  const attachmentRows = attachments.length ? attachments.map(renderSupportAttachment).join('') : '<p>no attachments.</p>';
  const id = request.id;
  const actions = renderDetailActions({ request, id, csrf, forms });
  return supportLayout(request.subject, `${supportTopbar()}
<a class="back" href="/">${BACK_SVG} your services</a>
<h1>${esc(request.subject)}</h1>
${supportNotices(notices)}
${renderOutcome(outcome)}
<p class="meta">${esc(supportStatusLabel(request.status))}</p>
${request.closeScheduledAtMs != null ? `<p class="notice">details are scheduled to be removed on ${esc(formatDate(request.closeScheduledAtMs))}. replying or choosing "I still need help" cancels this.</p>` : ''}
<h2>messages</h2>${messageRows ? `<div class="group">${messageRows}</div>` : '<p>no messages.</p>'}
<h2>attachments</h2>${attachments.length ? `<div class="group">${attachmentRows}</div>` : attachmentRows}
${actions}`);
}

export function renderSupportTombstone({ tombstone } = {}) {
  return supportLayout('closed request', `${supportTopbar()}
<a class="back" href="/support">${BACK_SVG} your support</a>
<h1>closed request</h1>
<p>request #${esc(tombstone.id)}</p>
<p>created ${esc(formatDate(tombstone.createdAtMs))}</p>
<p>closed ${esc(formatDate(tombstone.closedAtMs))}</p>
<p>status: closed</p>
<p>details removed to protect your privacy.</p>`);
}

export function renderSupportRemoving({
  id,
  retryAfter = null,
  operationKey = null,
  retryAction = 'close',
  csrf = '',
}) {
  const retryField = retryAction === 'resolution' ? 'resolution_retry' : 'close_retry';
  const retry = operationKey
    ? `<form method="post" action="/support/${escAttr(id)}/${retryAction}" data-support-form>
  ${hidden('csrf', csrf)}${hidden('operation_key', operationKey)}${hidden(retryField, 'refresh')}
  <p data-support-progress role="status" aria-live="polite" hidden></p>
  <button class="btn secondary" type="submit">check again</button>
</form>`
    : `<a class="btn secondary" href="/support/${escAttr(id)}">check again</a>`;
  const hint = retryAfter ? `<p>try again in ${esc(retryAfter)}.</p>` : '';
  return supportLayout('removing details', `${supportTopbar()}
<a class="back" href="/support">${BACK_SVG} your support</a>
<h1>removing details</h1>
<p>we are removing submitted details. this page will stay content-free until that work is complete.</p>
${hint}${retry}`);
}

export function renderSupportConfirmationRequired({ id, csrf, operationKey, solved = false }) {
  const action = solved ? `/support/${escAttr(id)}/resolution` : `/support/${escAttr(id)}/close`;
  const body = `${solved ? hidden('outcome', 'solved') : ''}${confirmationField()}`;
  return supportLayout('review removal', `${supportTopbar()}
<a class="back" href="/support/${escAttr(id)}">${BACK_SVG} your support</a>
<h1>review removal</h1><p class="error">confirm removal before continuing.</p>
${supportForm({ action, csrf, operationKey, body, button: solved ? 'this solved it' : 'close and remove details' })}`);
}

export function renderSupportNotFound() {
  return supportLayout('request not found', `${supportTopbar()}
<a class="back" href="/">${BACK_SVG} your services</a>
<h1>request not found</h1><p>we couldn't find that request.</p>
<a class="btn secondary" href="/support">back to your support</a>`);
}

function renderDetailActions({ request, id, csrf, forms }) {
  const reply = forms.reply || {};
  const resolution = forms.resolution || {};
  const close = forms.close || {};
  const reviewOutcomes = [reply.outcome, resolution.outcome, close.outcome].filter((outcome) => outcome?.requiresReview);
  if (reviewOutcomes.length) return `<div class="card">${reviewOutcomes.map(renderOutcome).join('')}<p><a class="btn secondary" href="/support/${escAttr(id)}">review request again</a></p></div>`;
  const replyForm = forms.attachmentRetry ? '' : `<div class="card"><h2>reply</h2><p>add a reply, or attach a screenshot or log.</p>
  <p class="notice">screenshots and logs are used only to triage your request. after you submit, they're not viewable or downloadable here. an operator may review a short-lived copy in an isolated environment; the portal file and that working copy are deleted promptly after review. until the request closes, we keep only a short triage summary; closing removes it with the other live request details.</p>
  ${renderOutcome(reply.outcome)}
  ${supportForm({ action: `/support/${id}/reply`, csrf, operationKey: reply.operationKey, attachmentOperationKey: reply.attachmentOperationKey, body: `${textArea('reply-content', 'content', 'reply', reply.value || '')}
  ${fileField('reply-file')}${safeContentField('reply-safe-content')}`, button: 'reply', enctype: true })}</div>`;
  const cancellation = (request.status === 'proposed' || (request.status === 'waiting' && request.closeScheduledAtMs != null))
    ? supportForm({ action: `/support/${id}/resolution`, csrf, operationKey: resolution.operationKey, body: hidden('outcome', 'still_need_help'), button: 'I still need help' })
    : '';
  const solved = request.status === 'proposed'
    ? supportForm({ action: `/support/${id}/resolution`, csrf, operationKey: resolution.solvedOperationKey, body: `${hidden('outcome', 'solved')}${confirmationField()}`, button: 'this solved it' })
    : '';
  const closeForm = supportForm({ action: `/support/${id}/close`, csrf, operationKey: close.operationKey, body: confirmationField(), button: 'close and remove details' });
  const attachmentRetry = forms.attachmentRetry ? renderAttachmentRetry(forms.attachmentRetry, csrf) : '';
  return `${replyForm}${attachmentRetry}<div class="card"><h2>request actions</h2>${renderOutcome(resolution.outcome)}${solved}${cancellation}${renderOutcome(close.outcome)}${closeForm}</div>`;
}

function renderActiveSection(section, nowMs) {
  if (section.state === 'hidden') return '';
  const rows = (section.requests || []).map((row) => `<div class="row" style="cursor:default"><div class="body">
  <div class="title"><a href="/support/${escAttr(row.id)}">${esc(row.subject)}</a></div>
  <div class="desc">${esc(supportStatusLabel(row.status))} · updated ${esc(formatRelativeTime(row.updatedAtMs, nowMs))}</div>
</div></div>`).join('');
  return `<section><h2>active requests</h2>${supportNotices(section.notices || [])}${sectionProblem(section)}
${rows ? `<div class="group">${rows}</div>` : section.state === 'ready' ? '<p>no open requests. need help? open one below, or sol can file one for you.</p>' : ''}</section>`;
}

function renderClosedSection(section) {
  if (section.state === 'hidden') return '';
  const rows = (section.requests || []).map((row) => `<div class="row" style="cursor:default"><div class="body">
  <div class="title"><a href="/support/${escAttr(row.id)}">request #${esc(row.id)}</a></div>
  <div class="desc">closed ${esc(formatDate(row.closedAtMs))} · details removed to protect your privacy</div>
</div></div>`).join('');
  const more = section.nextCursor ? `<p><a class="btn secondary" href="/support/closed?cursor=${escAttr(section.nextCursor)}">older closed requests</a></p>` : '';
  return `<section><h2>closed requests</h2>${sectionProblem(section)}
${rows ? `<div class="group">${rows}</div>` : section.state === 'ready' ? '<p>no closed requests.</p>' : ''}${more}</section>`;
}

function renderCreateSection(section, csrf) {
  if (section.state === 'hidden') return '';
  if (section.attachmentRetry) return renderAttachmentRetry(section.attachmentRetry, csrf);
  const values = section.values || {};
  if (section.outcome?.requiresReview) return `${renderOutcome(section.outcome)}<p><a class="btn secondary" href="/support">review request again</a></p>`;
  return `${section.message ? `<p class="notice">${esc(section.message)}</p>` : ''}${renderOutcome(section.outcome)}
${section.createConfirmation ? `<p class="notice">got it, this is request #${esc(section.createConfirmation.id)}. you can follow it right here.</p><p><a href="/support/${escAttr(section.createConfirmation.id)}">view request</a></p>` : ''}
<div class="card"><h2>open a request</h2><p>tell us what's going on. you can attach screenshots or logs here. it's easier than email.</p>
<p class="notice">screenshots and logs are used only to triage your request. after you submit, they're not viewable or downloadable here. an operator may review a short-lived copy in an isolated environment; the portal file and that working copy are deleted promptly after review. until the request closes, we keep only a short triage summary; closing removes it with the other live request details.</p>
${supportForm({ action: '/support', csrf, operationKey: section.operationKey, attachmentOperationKey: section.attachmentOperationKey, enctype: true, body: `${textInput('support-subject', 'subject', "what's going on?", values.subject || '')}
${textArea('support-description', 'description', 'the details', values.description || '')}
<label for="support-product">which product?</label><select id="support-product" name="product" required>
<option value="solstone"${values.product === 'solstone' ? ' selected' : ''}>solstone</option><option value="vit"${values.product === 'vit' ? ' selected' : ''}>vit</option><option value="general"${values.product === 'general' ? ' selected' : ''}>something else</option></select>${fileField('support-file')}${safeContentField('create-safe-content')}`, button: 'open a request' })}</div>`;
}

function renderAttachmentRetry({ id, operationKey, message = '' }, csrf) {
  return `<div class="card"><h2>attachments need another try</h2><p>${esc(message || 'the files were not confirmed. reselect the same files in the same order to try again.')}</p>
${supportForm({ action: `/support/${id}/attachments`, csrf, operationKey, enctype: true, body: `${fileField('retry-file')}${safeContentField('retry-safe-content')}`, button: 'send attachments again' })}</div>`;
}

function supportForm({ action, csrf, operationKey, attachmentOperationKey = null, body, button, enctype = false }) {
  const encoding = enctype ? ' enctype="multipart/form-data"' : '';
  return `<form method="post" action="${escAttr(action)}" data-support-form${encoding}>
${hidden('csrf', csrf)}${hidden('operation_key', operationKey)}${attachmentOperationKey ? hidden('attachment_operation_key', attachmentOperationKey) : ''}
${body}<p data-support-progress role="status" aria-live="polite" hidden></p><button class="btn primary" type="submit">${esc(button)}</button></form>`;
}

function textInput(id, name, label, value) {
  return `<label for="${escAttr(id)}">${esc(label)}</label><input id="${escAttr(id)}" name="${escAttr(name)}" required maxlength="200" value="${escAttr(value)}">`;
}

function textArea(id, name, label, value) {
  return `<label for="${escAttr(id)}">${esc(label)}</label><textarea id="${escAttr(id)}" name="${escAttr(name)}" required maxlength="5000">${esc(value)}</textarea>`;
}

function fileField(id) {
  return `<label for="${escAttr(id)}">attachments</label><p>optional screenshots/logs</p><input id="${escAttr(id)}" type="file" name="file" multiple>`;
}

function safeContentField(id) {
  return `<p class="notice" id="${escAttr(id)}-note">redact passwords, private keys, authentication tokens, payment-card or government IDs, precise location, sensitive personal data, and anything about a child. if you cannot explain the problem safely, email support@solstone.app first.</p><label class="ack"><input id="${escAttr(id)}" type="checkbox" name="safe_content" value="confirmed" required aria-describedby="${escAttr(id)}-note"><span>i reviewed this request and removed that information.</span></label>`;
}

function confirmationField() {
  return `${hidden('confirmation_control', 'checkbox')}<label class="ack"><input type="checkbox" name="confirmation" value="remove_details" required><span>i understand that the support service permanently removes submitted request details—including subject, messages, files, and working classification. a minimal closed marker, the narrow ownership and closure records needed to show it to me, and limited delivery and retry records remain.</span></label>`;
}

function renderSupportAttachment(attachment) {
  const filename = esc(attachment.filename);
  if (attachment.status === 'removed') return `<div class="row" style="cursor:default"><div class="body"><div class="title">${filename}</div><div class="desc">attachment removed after triage${attachment.triage_summary ? ` ${esc(attachment.triage_summary)}` : ''}</div></div></div>`;
  if (attachment.status === 'pending') return `<div class="row" style="cursor:default"><div class="body"><div class="title">${filename}</div><div class="desc">pending</div></div></div>`;
  return `<div class="row" style="cursor:default"><div class="body"><div class="title">${filename}</div><div class="desc">unreadable attachment state</div></div></div>`;
}

function renderOutcome(outcome) {
  if (!outcome) return '';
  return `<p class="${outcome.kind === 'error' ? 'error' : 'notice'}">${esc(outcome.message)}</p>`;
}

function sectionProblem(section) {
  if (!section.error) return '';
  return `<p class="error">${esc(section.error)}</p>${section.retryHref ? `<p><a class="btn secondary" href="${escAttr(section.retryHref)}">try again</a></p>` : ''}`;
}

function supportNotices(notices) {
  return notices.map((notice) => `<p class="notice">${esc(notice)}</p>`).join('');
}

function supportStatusLabel(status) {
  // support-wire rejects unknown statuses; make a bypass visible rather than inventing one.
  return SUPPORT_STATUS_LABELS[status] ?? 'unreadable status';
}

function hidden(name, value) {
  return `<input type="hidden" name="${escAttr(name)}" value="${escAttr(value || '')}">`;
}

function supportTopbar() {
  return topbar();
}

function supportLayout(title, body) {
  return layout({ title, body, afterMain: `<script>${SUPPORT_FORMS_JS}</script>` });
}
