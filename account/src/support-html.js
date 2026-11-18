import { htmlText, t } from '../../i18n/account.mjs';

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
import { SUPPORT_DRAFT_JS } from './inline/support-draft.js';

const SUPPORT_STATUS_LABELS = {
  open: t('account.support.open'),
  'in-progress': t('account.support.inprogress'),
  waiting: t('account.support.waitingonyou'),
  proposed: t('account.support.proposalready'),
  resolved: t('account.support.resolved'),
};

export function renderSupportList({ sections, nowMs = Date.now(), csrf = '' }) {
  return supportLayout(t('account.support.yoursupport'), `${supportTopbar()}
<a class="back" href="/">${BACK_SVG} ${htmlText('account.support.yourservices2')}</a>
<h1>${htmlText('account.support.yoursupport')}</h1>
<p class="meta" style="margin:2px 0 18px">${htmlText('account.support.ifaserviceisntworkingthe')} <a href="https://status.solstone.app">${htmlText('account.support.servicestatuspage')}</a> ${htmlText('account.support.showsitslatestcheckandanyincidentsolpbchaspost')}</p>
${renderActiveSection(sections.active, nowMs)}
${renderClosedSection(sections.closed)}
${renderCreateSection(sections.create, csrf)}`, Boolean(sections.create.createConfirmation || sections.create.attachmentRetry), sections.create.state !== 'hidden');
}

export function renderSupportDetail({ request, messages = [], attachments = [], csrf = '', nowMs = Date.now(), notices = [], forms = {}, outcome = null }) {
  const messageRows = messages.map((message) => `<div class="row" style="cursor:default">
  <div class="body"><div class="title">${esc(message.authorLabel || t('account.support.unknownsender'))}</div>
  <p>${esc(message.content || '')}</p><div class="meta">${esc(formatRelativeTime(message.createdAtMs, nowMs))}</div></div>
</div>${message.authorWarning ? '<p class="notice">' + htmlText('account.support.somesenderdetailscouldnotberead') + '</p>' : ''}`).join('');
  const attachmentRows = attachments.length ? attachments.map(renderSupportAttachment).join('') : '<p>' + htmlText('account.support.noattachments') + '</p>';
  const id = request.id;
  const actions = renderDetailActions({ request, id, csrf, forms });
  return supportLayout(request.subject, `${supportTopbar()}
<a class="back" href="/">${BACK_SVG} ${htmlText('account.support.yourservices2')}</a>
<h1>${esc(request.subject)}</h1>
${supportNotices(notices)}
${renderOutcome(outcome)}
<p class="meta">${esc(supportStatusLabel(request.status))}</p>
${request.closeScheduledAtMs != null ? `<p class="notice">${htmlText('account.support.detailsarescheduledtoberemovedon')} ${esc(formatDate(request.closeScheduledAtMs))}${htmlText('account.support.replyingorchoosingistillneedhelpcancelsthis')}</p>` : ''}
<h2>${htmlText('account.support.messages')}</h2>${messageRows ? `<div class="group">${messageRows}</div>` : '<p>' + htmlText('account.support.nomessages') + '</p>'}
<h2>${htmlText('account.support.attachments')}</h2>${attachments.length ? `<div class="group">${attachmentRows}</div>` : attachmentRows}
${actions}`);
}

export function renderSupportTombstone({ tombstone, clearDraft = false } = {}) {
  return supportLayout(t('account.support.closedrequest'), `${supportTopbar()}
<a class="back" href="/support">${BACK_SVG} ${htmlText('account.support.yoursupport')}</a>
<h1>${htmlText('account.support.closedrequest')}</h1>
<p>${htmlText('account.support.request2')}${esc(tombstone.id)}</p>
<p>${htmlText('account.support.created2')} ${esc(formatDate(tombstone.createdAtMs))}</p>
<p>${htmlText('account.support.closed2')} ${esc(formatDate(tombstone.closedAtMs))}</p>
<p>${htmlText('account.support.statusclosed')}</p>
<p>${htmlText('account.support.detailsremovedprotectyourprivacy')}</p>`, clearDraft);
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
  <button class="btn secondary" type="submit">${htmlText('account.support.checkagain')}</button>
</form>`
    : `<a class="btn secondary" href="/support/${escAttr(id)}">${htmlText('account.support.checkagain')}</a>`;
  const hint = retryAfter ? `<p>${htmlText('account.support.tryagainin2')} ${esc(retryAfter)}.</p>` : '';
  return supportLayout(t('account.support.removingdetails'), `${supportTopbar()}
<a class="back" href="/support">${BACK_SVG} ${htmlText('account.support.yoursupport')}</a>
<h1>${htmlText('account.support.removingdetails')}</h1>
<p>${htmlText('account.support.weareremovingsubmitteddetailsthispage')}</p>
${hint}${retry}`);
}

export function renderSupportConfirmationRequired({ id, csrf, operationKey, solved = false }) {
  const action = solved ? `/support/${escAttr(id)}/resolution` : `/support/${escAttr(id)}/close`;
  const body = `${solved ? hidden('outcome', 'solved') : ''}${confirmationField()}`;
  return supportLayout(t('account.support.reviewremoval'), `${supportTopbar()}
<a class="back" href="/support/${escAttr(id)}">${BACK_SVG} ${htmlText('account.support.yoursupport')}</a>
<h1>${htmlText('account.support.reviewremoval')}</h1><p class="error">${htmlText('account.support.confirmremovalbeforecontinuing')}</p>
${supportForm({ action, csrf, operationKey, body, button: solved ? t('account.support.thissolvedit') : t('account.support.closeandremovedetails') })}`);
}

export function renderSupportNotFound() {
  return supportLayout(t('account.support.requestnotfound'), `${supportTopbar()}
<a class="back" href="/">${BACK_SVG} ${htmlText('account.support.yourservices2')}</a>
<h1>${htmlText('account.support.requestnotfound')}</h1><p>${htmlText('account.support.wecouldntfindthatrequest')}</p>
<a class="btn secondary" href="/support">${htmlText('account.support.backyoursupport')}</a>`);
}

function renderDetailActions({ request, id, csrf, forms }) {
  const reply = forms.reply || {};
  const resolution = forms.resolution || {};
  const close = forms.close || {};
  const reviewOutcomes = [reply.outcome, resolution.outcome, close.outcome].filter((outcome) => outcome?.requiresReview);
  if (reviewOutcomes.length) return `<div class="card">${reviewOutcomes.map(renderOutcome).join('')}<p><a class="btn secondary" href="/support/${escAttr(id)}">${htmlText('account.support.reviewrequestagain')}</a></p></div>`;
  const replyForm = forms.attachmentRetry ? '' : `<div class="card"><h2>${htmlText('account.support.reply')}</h2><p>${htmlText('account.support.addreplyorattachscreenshotorlog')}</p>
  <p class="notice">${htmlText('account.support.screenshotsandlogsareusedonlytriage')}</p>
  ${renderOutcome(reply.outcome)}
  ${supportForm({ action: `/support/${id}/reply`, csrf, operationKey: reply.operationKey, attachmentOperationKey: reply.attachmentOperationKey, body: `${textArea('reply-content', 'content', t('account.support.reply'), reply.value || '')}
  ${fileField('reply-file')}`, button: t('account.support.reply'), enctype: true })}</div>`;
  const cancellation = (request.status === 'proposed' || (request.status === 'waiting' && request.closeScheduledAtMs != null))
    ? supportForm({ action: `/support/${id}/resolution`, csrf, operationKey: resolution.operationKey, body: hidden('outcome', 'still_need_help'), button: t('account.support.istillneedhelp') })
    : '';
  const solved = request.status === 'proposed'
    ? supportForm({ action: `/support/${id}/resolution`, csrf, operationKey: resolution.solvedOperationKey, body: `${hidden('outcome', 'solved')}${confirmationField()}`, button: t('account.support.thissolvedit') })
    : '';
  const closeForm = supportForm({ action: `/support/${id}/close`, csrf, operationKey: close.operationKey, body: confirmationField(), button: t('account.support.closeandremovedetails') });
  const attachmentRetry = forms.attachmentRetry ? renderAttachmentRetry(forms.attachmentRetry, csrf) : '';
  return `${replyForm}${attachmentRetry}<div class="card"><h2>${htmlText('account.support.requestactions')}</h2>${renderOutcome(resolution.outcome)}${solved}${cancellation}${renderOutcome(close.outcome)}${closeForm}</div>`;
}

function renderActiveSection(section, nowMs) {
  if (section.state === 'hidden') return '';
  const rows = (section.requests || []).map((row) => `<div class="row" style="cursor:default"><div class="body">
  <div class="title"><a href="/support/${escAttr(row.id)}">${esc(row.subject)}</a></div>
  <div class="desc">${esc(supportStatusLabel(row.status))} ${htmlText('account.support.updated2')} ${esc(formatRelativeTime(row.updatedAtMs, nowMs))}</div>
</div></div>`).join('');
  return `<section><h2>${htmlText('account.support.activerequests')}</h2>${supportNotices(section.notices || [])}${sectionProblem(section)}
${rows ? `<div class="group">${rows}</div>` : section.state === 'ready' ? '<p>' + htmlText('account.support.noopenrequestsneedhelpopenone') + '</p>' : ''}</section>`;
}

function renderClosedSection(section) {
  if (section.state === 'hidden') return '';
  const rows = (section.requests || []).map((row) => `<div class="row" style="cursor:default"><div class="body">
  <div class="title"><a href="/support/${escAttr(row.id)}">${htmlText('account.support.request2')}${esc(row.id)}</a></div>
  <div class="desc">${htmlText('account.support.closed2')} ${esc(formatDate(row.closedAtMs))} ${htmlText('account.support.detailsremovedtoprotectyourprivacy')}</div>
</div></div>`).join('');
  const more = section.nextCursor ? `<p><a class="btn secondary" href="/support/closed?cursor=${escAttr(section.nextCursor)}">${htmlText('account.support.olderclosedrequests')}</a></p>` : '';
  return `<section><h2>${htmlText('account.support.closedrequests')}</h2>${sectionProblem(section)}
${rows ? `<div class="group">${rows}</div>` : section.state === 'ready' ? '<p>' + htmlText('account.support.noclosedrequests') + '</p>' : ''}${more}</section>`;
}

function renderCreateSection(section, csrf) {
  if (section.state === 'hidden') return '';
  if (section.attachmentRetry) return renderAttachmentRetry(section.attachmentRetry, csrf);
  const values = section.values || {};
  if (section.outcome?.requiresReview && !section.restartKeys) return `${renderOutcome(section.outcome)}<p><a class="btn secondary" href="/support">${htmlText('account.support.reviewrequestagain')}</a></p>`;
  return `${section.message ? `<p class="notice">${esc(section.message)}</p>` : ''}${renderOutcome(section.outcome)}
${section.createConfirmation ? `<p class="notice">${htmlText('account.support.gotitthisisrequest')}${esc(section.createConfirmation.id)}${htmlText('account.support.youcanfollowitrighthere')}</p><p><a href="/support/${escAttr(section.createConfirmation.id)}">${htmlText('account.support.viewrequest')}</a></p>` : ''}
<div class="card"><h2>${htmlText('account.support.openrequest')}</h2><p>${htmlText('account.support.telluswhatsgoingonyou')}</p>
<p class="notice">${htmlText('account.support.screenshotsandlogsareusedonlytriage')}</p>
${supportForm({ action: '/support', csrf, operationKey: section.operationKey, attachmentOperationKey: section.attachmentOperationKey, returned: section.returned, enctype: true, body: `${textInput('support-subject', 'subject', t('account.support.whatsgoingon'), values.subject || '')}
${textArea('support-description', 'description', t('account.support.details'), values.description || '')}
<label for="support-about">${htmlText('account.support.yourversions')}</label><p id="support-about-note">${htmlText('account.support.optionalopenaboutchoosecopyandpaste')}</p>
<textarea id="support-about" name="about" aria-describedby="support-about-note">
${esc(values.about || '')}</textarea>
${section.restartKeys ? `<button class="btn secondary" type="button" data-support-restart data-operation-key="${escAttr(section.restartKeys.operationKey)}" data-attachment-key="${escAttr(section.restartKeys.attachmentOperationKey)}">${htmlText('account.support.startnewrequest')}</button>` : ''}
<label for="support-product">${htmlText('account.support.whichproduct')}</label><select id="support-product" name="product" required>
<option value="solstone"${values.product === 'solstone' ? ' selected' : ''}>solstone</option><option value="vit"${values.product === 'vit' ? ' selected' : ''}>vit</option><option value="general"${values.product === 'general' ? ' selected' : ''}>${htmlText('account.support.somethingelse')}</option></select>${fileField('support-file')}`, button: t('account.support.openrequest') })}</div>`;
}

function renderAttachmentRetry({ id, operationKey, message = '' }, csrf) {
  return `<div class="card"><h2>${htmlText('account.support.attachmentsneedanothertry')}</h2><p>${esc(message || t('account.support.fileswerenotconfirmedreselectsamefiles'))}</p>
${supportForm({ action: `/support/${id}/attachments`, csrf, operationKey, enctype: true, body: fileField('retry-file'), button: t('account.support.sendattachmentsagain') })}</div>`;
}

function supportForm({ action, csrf, operationKey, attachmentOperationKey = null, body, button, enctype = false, returned = false }) {
  const encoding = enctype ? ' enctype="multipart/form-data"' : '';
  return `<form method="post" action="${escAttr(action)}" data-support-form${returned ? ' data-support-returned' : ''}${encoding}>
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
  return `<label for="${escAttr(id)}">${htmlText('account.support.attachments')}</label><p>${htmlText('account.support.optionalscreenshotslogs')}</p><input id="${escAttr(id)}" type="file" name="file" multiple>`;
}

function confirmationField() {
  return `${hidden('confirmation_control', 'checkbox')}<label class="ack"><input type="checkbox" name="confirmation" value="remove_details" required><span>${htmlText('account.support.iunderstandthatsupportservicepermanentlyremoves')}</span></label>`;
}

function renderSupportAttachment(attachment) {
  const filename = esc(attachment.filename);
  if (attachment.status === 'removed') return `<div class="row" style="cursor:default"><div class="body"><div class="title">${filename}</div><div class="desc">${htmlText('account.support.attachmentremovedaftertriage2')}${attachment.triage_summary ? ` ${esc(attachment.triage_summary)}` : ''}</div></div></div>`;
  if (attachment.status === 'pending') return `<div class="row" style="cursor:default"><div class="body"><div class="title">${filename}</div><div class="desc">${htmlText('account.support.pending')}</div></div></div>`;
  return `<div class="row" style="cursor:default"><div class="body"><div class="title">${filename}</div><div class="desc">${htmlText('account.support.unreadableattachmentstate')}</div></div></div>`;
}

function renderOutcome(outcome) {
  if (!outcome) return '';
  return `<p class="${outcome.kind === 'error' ? 'error' : 'notice'}">${esc(outcome.message)}</p>`;
}

function sectionProblem(section) {
  if (!section.error) return '';
  return `<p class="error">${esc(section.error)}</p>${section.retryHref ? `<p><a class="btn secondary" href="${escAttr(section.retryHref)}">${htmlText('account.support.tryagain')}</a></p>` : ''}`;
}

function supportNotices(notices) {
  return notices.map((notice) => `<p class="notice">${esc(notice)}</p>`).join('');
}

function supportStatusLabel(status) {
  // support-wire rejects unknown statuses; make a bypass visible rather than inventing one.
  return SUPPORT_STATUS_LABELS[status] ?? t('account.support.unreadablestatus');
}

function hidden(name, value) {
  return `<input type="hidden" name="${escAttr(name)}" value="${escAttr(value || '')}">`;
}

function supportTopbar() {
  return topbar();
}

function supportLayout(title, body, clearDraft = false, withDraft = false) {
  const draftScript = withDraft ? SUPPORT_DRAFT_JS : clearDraft ? "try { sessionStorage.removeItem('solstone-support-draft-v1'); } catch (_) {}" : '';
  return layout({ title, body, afterMain: `${clearDraft && withDraft ? '<div data-support-created hidden></div>' : ''}${draftScript ? `<script>${draftScript}</script>` : ''}<script>${SUPPORT_FORMS_JS}</script>` });
}
