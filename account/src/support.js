import { decryptEmail, hashKey, randomBase64Url, timingSafeEqual } from './crypto.js';
import { listAccountEmails } from './db.js';
import { signInRedirect } from './enable.js';
import {
  renderSupportDetail,
  renderSupportConfirmationRequired,
  renderSupportList,
  renderSupportNotFound,
  renderSupportRemoving,
  renderSupportTombstone,
} from './support-html.js';
import { forbidden, html, supportOriginAllowed } from './index.js';
import { getValidSession } from './session.js';
import { SUPPORT_ID_REGEX } from './support-constants.js';
import { acknowledgeSupport, callSupport, decodeCursor, mergeTickets } from './support-wire.js';

const SUPPORT_LOAD_FAILURE = "we couldn't load your support right now. try again soon.";
const SUPPORT_PARTIAL_NOTICE = 'some support history could not be loaded.';
const SUPPORT_EMAIL_LIMITATION = 'we need a verified email before you can open a request.';
const ACTIVE_FAILURE = "we couldn't load active requests. try again.";
const CLOSED_FAILURE = "we couldn't load closed requests. try again.";
const NO_STORE = { 'Cache-Control': 'no-store' };
const OPERATION_KEY = /^[A-Za-z0-9_-]{43}$/;

export function supportSignInPrompt(path) {
  if (path === '/support') return "sign in with your email to see your support. we'll email you a code.";
  const id = supportIdFromPath(path);
  return id ? `sign in with your email to see request #${id}. we'll email you a code.` : null;
}

export async function handleSupportList(req, env) {
  const guard = await signedSupportSessionOrRedirect(req, env, '/support');
  if (guard instanceof Response) return guard;
  return renderSupportListForSession(env, guard.session, guard.nowMs, { section: new URL(req.url).searchParams.get('section') });
}

export async function handleSupportClosed(req, env) {
  const guard = await signedSupportSessionOrRedirect(req, env, '/support/closed');
  if (guard instanceof Response) return guard;
  const url = new URL(req.url);
  const values = url.searchParams.getAll('cursor');
  const cursor = values.length === 1 ? values[0] : values.length === 0 ? null : undefined;
  const closed = await loadClosedHistory(env, guard.session.account_id, cursor, `/support/closed${url.search}`);
  return supportHtml(renderSupportList({ csrf: await csrfToken(env), nowMs: guard.nowMs, sections: {
    active: hiddenSection(), closed, create: hiddenSection(),
  }}));
}

export async function handleSupportCreate(req, env) {
  if (!supportOriginAllowed(req)) return noStore(forbidden());
  const guard = await signedSupportSessionOrRedirect(req, env, '/support');
  if (guard instanceof Response) return guard;
  const form = await checkedForm(req, env);
  if (form === false) return noStore(forbidden());
  if (!form) return renderCreateState(env, guard, { outcome: errorOutcome('we could not read that form. review it and try again.') });
  const values = createValues(form);
  const keys = submittedKeys(form);
  if (!validCreate(values) || !keys) return renderCreateState(env, guard, { values, outcome: errorOutcome('review the request before sending it.') });
  const usable = await usableVerifiedEmails(env, guard.session.account_id);
  if (!usable.emails.length) return renderCreateState(env, guard, { values, keys, message: SUPPORT_EMAIL_LIMITATION });
  const email = (usable.emails.find((row) => row.isPrimary) || usable.emails[0]).address;
  const parent = await runMutation(env, {
    ownerId: guard.session.account_id,
    idempotencyKey: keys.operationKey,
    mutation: 'ticket.create',
    path: '/api/services/tickets',
    verifiedEmail: email,
    json: values,
  });
  if (parent.classification === 'tombstone') return supportHtml(renderSupportTombstone({ tombstone: parent.data }));
  if (parent.classification === 'invalidState') return renderSupportListForSession(env, guard.session, guard.nowMs);
  if (parent.classification !== 'success') {
    return renderCreateState(env, guard, { values, keys: preserveKey(parent) ? keys : null, outcome: outcomeFor(parent, 'the request could not be confirmed. the files were not sent.') });
  }
  const files = selectedFiles(form);
  if (!files.length) return renderCreateState(env, guard, { createConfirmation: { id: parent.data.id } });
  const attachment = await sendAttachmentBatch(env, guard.session.account_id, parent.data.id, keys.attachmentOperationKey, files);
  if (attachment.classification === 'success') return renderCreateState(env, guard, { createConfirmation: { id: parent.data.id } });
  if (attachment.classification === 'tombstone') return supportHtml(renderSupportTombstone({ tombstone: attachment.data }));
  if (attachment.classification === 'idempotencyConflict') {
    return renderCreateState(env, guard, { outcome: reviewOutcome(attachmentRetryMessage(attachment)) });
  }
  return renderCreateState(env, guard, { attachmentRetry: { id: parent.data.id, operationKey: keys.attachmentOperationKey, message: attachmentRetryMessage(attachment) } });
}

export async function handleSupportDetail(req, env, id) {
  if (!SUPPORT_ID_REGEX.test(id || '')) return supportNotFoundResponse();
  const guard = await signedSupportSessionOrRedirect(req, env, `/support/${id}`);
  if (guard instanceof Response) return guard;
  return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
}

export async function handleSupportReply(req, env, id) {
  if (!supportOriginAllowed(req)) return noStore(forbidden());
  if (!SUPPORT_ID_REGEX.test(id || '')) return supportNotFoundResponse();
  const guard = await signedSupportSessionOrRedirect(req, env, `/support/${id}`);
  if (guard instanceof Response) return guard;
  const form = await checkedForm(req, env);
  if (form === false) return noStore(forbidden());
  if (!form) return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
  const content = String(form.get('content') || '').trim();
  const keys = submittedKeys(form);
  if (!content || !keys) return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
  const detail = await ownedActiveDetail(env, guard.session.account_id, id);
  if (detail instanceof Response) return detail;
  const parent = await runMutation(env, {
    ownerId: guard.session.account_id, idempotencyKey: keys.operationKey, mutation: 'ticket.message',
    path: `/api/services/tickets/${encodeURIComponent(id)}/messages`, json: { content },
  });
  if (parent.classification === 'tombstone') return supportHtml(renderSupportTombstone({ tombstone: parent.data }));
  if (parent.classification === 'invalidState') return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
  if (parent.classification !== 'success') return renderActiveDetail(env, guard, detail, {
    reply: { ...(preserveKey(parent) ? keys : {}), value: content, outcome: outcomeFor(parent, 'the reply could not be confirmed. the files were not sent.') },
  });
  const files = selectedFiles(form);
  if (!files.length) return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
  const attachment = await sendAttachmentBatch(env, guard.session.account_id, id, keys.attachmentOperationKey, files);
  if (attachment.classification === 'success') return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
  if (attachment.classification === 'tombstone') return supportHtml(renderSupportTombstone({ tombstone: attachment.data }));
  if (attachment.classification === 'invalidState') return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
  if (attachment.classification === 'idempotencyConflict') return renderActiveDetail(env, guard, detail, {
    reply: { outcome: reviewOutcome(attachmentRetryMessage(attachment)) },
  });
  return renderActiveDetail(env, guard, detail, { reply: { ...keys, value: content, outcome: errorOutcome(attachmentRetryMessage(attachment)) }, attachmentRetry: {
    id, operationKey: keys.attachmentOperationKey, message: attachmentRetryMessage(attachment),
  }});
}

export async function handleSupportAttachments(req, env, id) {
  if (!supportOriginAllowed(req)) return noStore(forbidden());
  if (!SUPPORT_ID_REGEX.test(id || '')) return supportNotFoundResponse();
  const guard = await signedSupportSessionOrRedirect(req, env, `/support/${id}`);
  if (guard instanceof Response) return guard;
  const form = await checkedForm(req, env);
  if (form === false) return noStore(forbidden());
  const key = form && String(form.get('operation_key') || '');
  if (!form || !validOperationKey(key) || !selectedFiles(form).length) return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
  const detail = await ownedActiveDetail(env, guard.session.account_id, id);
  if (detail instanceof Response) return detail;
  const attachment = await sendAttachmentBatch(env, guard.session.account_id, id, key, selectedFiles(form));
  if (attachment.classification === 'success') return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
  if (attachment.classification === 'tombstone') return supportHtml(renderSupportTombstone({ tombstone: attachment.data }));
  if (attachment.classification === 'invalidState') return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
  if (attachment.classification === 'idempotencyConflict') return renderActiveDetail(env, guard, detail, {
    reply: { outcome: reviewOutcome(attachmentRetryMessage(attachment)) },
  });
  return renderActiveDetail(env, guard, detail, { attachmentRetry: { id, operationKey: key, message: attachmentRetryMessage(attachment) } });
}

export async function handleSupportResolution(req, env, id) {
  if (!supportOriginAllowed(req)) return noStore(forbidden());
  if (!SUPPORT_ID_REGEX.test(id || '')) return supportNotFoundResponse();
  const guard = await signedSupportSessionOrRedirect(req, env, `/support/${id}`);
  if (guard instanceof Response) return guard;
  const form = await checkedForm(req, env);
  if (form === false) return noStore(forbidden());
  const outcome = form && String(form.get('outcome') || '');
  const key = form && String(form.get('operation_key') || '');
  if (!form || !validOperationKey(key) || !['solved', 'still_need_help'].includes(outcome)) return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
  if (outcome === 'solved' && !hasRemovalConfirmation(form)) {
    return supportHtml(renderSupportConfirmationRequired({ id, csrf: await csrfToken(env), operationKey: key, solved: true }));
  }
  const detail = await ownedActiveDetail(env, guard.session.account_id, id);
  if (detail instanceof Response) return detail;
  const result = await runMutation(env, {
    ownerId: guard.session.account_id, idempotencyKey: key, mutation: 'ticket.resolution',
    path: `/api/services/tickets/${encodeURIComponent(id)}/resolution`, json: { outcome },
  });
  if (result.classification === 'tombstone') return supportHtml(renderSupportTombstone({ tombstone: result.data }));
  if (result.classification === 'success' || result.classification === 'invalidState') return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
  return renderActiveDetail(env, guard, detail, { resolution: {
    ...(preserveKey(result) ? { operationKey: key, solvedOperationKey: key } : {}), outcome: outcomeFor(result),
  } });
}

export async function handleSupportClose(req, env, id) {
  if (!supportOriginAllowed(req)) return noStore(forbidden());
  if (!SUPPORT_ID_REGEX.test(id || '')) return supportNotFoundResponse();
  const guard = await signedSupportSessionOrRedirect(req, env, `/support/${id}`);
  if (guard instanceof Response) return guard;
  const form = await checkedForm(req, env);
  if (form === false) return noStore(forbidden());
  const key = form && String(form.get('operation_key') || '');
  if (!form || !validOperationKey(key)) return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
  if (form.get('close_retry') === 'refresh') return renderCloseRefresh(env, guard, id, key);
  if (!hasRemovalConfirmation(form)) {
    return supportHtml(renderSupportConfirmationRequired({ id, csrf: await csrfToken(env), operationKey: key }));
  }
  const detail = await ownedActiveDetail(env, guard.session.account_id, id);
  if (detail instanceof Response) return detail;
  const result = await runMutation(env, {
    ownerId: guard.session.account_id, idempotencyKey: key, mutation: 'ticket.close',
    path: `/api/services/tickets/${encodeURIComponent(id)}/close`, json: {},
  });
  if (result.classification === 'tombstone') return supportHtml(renderSupportTombstone({ tombstone: result.data }));
  if (result.classification === 'closeInProgress') return supportHtml(renderSupportRemoving({ id, retryAfter: result.retryAfter, closeKey: key, csrf: await csrfToken(env) }));
  if (result.classification === 'invalidState') return renderSupportDetailForSession(env, guard.session, id, guard.nowMs);
  return renderActiveDetail(env, guard, detail, { close: { ...(preserveKey(result) ? { operationKey: key } : {}), outcome: outcomeFor(result) } });
}

async function renderSupportListForSession(env, session, nowMs, { section = null } = {}) {
  const csrf = await csrfToken(env);
  const usable = await usableVerifiedEmails(env, session.account_id);
  const create = createSection(usable.emails.length ? '' : SUPPORT_EMAIL_LIMITATION);
  if (section === 'active') {
    return supportHtml(renderSupportList({ csrf, nowMs, sections: {
      active: await loadActiveRequests(env, session.account_id, usable), closed: hiddenSection(), create,
    }}));
  }
  const [active, closed] = await Promise.all([loadActiveRequests(env, session.account_id, usable), loadClosedHistory(env, session.account_id, null)]);
  return supportHtml(renderSupportList({ csrf, nowMs, sections: { active, closed, create } }));
}

async function renderSupportDetailForSession(env, session, id, nowMs, { forms = null } = {}) {
  const usable = await usableVerifiedEmails(env, session.account_id);
  const detail = await loadDetailOwnerFirst(env, session.account_id, id, usable);
  if (detail.classification === 'notFound') return supportNotFoundResponse();
  if (detail.classification === 'closeInProgress') return supportHtml(renderSupportRemoving({ id, retryAfter: detail.retryAfter }));
  if (detail.classification !== 'success') return renderCreateState(env, { session, nowMs }, { outcome: errorOutcome(SUPPORT_LOAD_FAILURE) });
  if (detail.data.type === 'tombstone') return supportHtml(renderSupportTombstone({ tombstone: detail.data.tombstone }));
  return renderActiveDetail(env, { session, nowMs }, detail.data, forms || freshForms(), usable.decryptSkipped ? [SUPPORT_PARTIAL_NOTICE] : []);
}

async function renderActiveDetail(env, guard, detail, overrides = {}, notices = []) {
  if (overrides.attachmentRetry) {
    // The reply form remains visible only as a new owner action; retry uses its own batch key.
    overrides.reply = { ...(overrides.reply || {}), outcome: overrides.reply?.outcome };
  }
  const fresh = freshForms();
  const forms = {
    ...fresh,
    ...overrides,
    reply: { ...fresh.reply, ...(overrides.reply || {}) },
    resolution: { ...fresh.resolution, ...(overrides.resolution || {}) },
    close: { ...fresh.close, ...(overrides.close || {}) },
  };
  return supportHtml(renderSupportDetail({ ...detail, csrf: await csrfToken(env), nowMs: guard.nowMs, notices, forms }));
}

async function renderCloseRefresh(env, guard, id, key) {
  const detail = await loadDetail(env, id, guard.session.account_id);
  if (detail.classification === 'closeInProgress') return supportHtml(renderSupportRemoving({ id, retryAfter: detail.retryAfter, closeKey: key, csrf: await csrfToken(env) }));
  if (detail.classification === 'success' && detail.data.type === 'tombstone') return supportHtml(renderSupportTombstone({ tombstone: detail.data.tombstone }));
  return renderSupportDetailForSession(env, guard.session, id, guard.nowMs, { forms: { close: { operationKey: key } } });
}

async function ownedActiveDetail(env, ownerId, id) {
  const usable = await usableVerifiedEmails(env, ownerId);
  const result = await loadDetailOwnerFirst(env, ownerId, id, usable);
  if (result.classification === 'notFound') return supportNotFoundResponse();
  if (result.classification === 'closeInProgress') return supportHtml(renderSupportRemoving({ id, retryAfter: result.retryAfter }));
  if (result.classification !== 'success') return supportHtml(renderSupportNotFound());
  if (result.data.type === 'tombstone') return supportHtml(renderSupportTombstone({ tombstone: result.data.tombstone }));
  return result.data;
}

async function sendAttachmentBatch(env, ownerId, id, key, files) {
  const formData = new FormData();
  for (const file of files) formData.append('file', file, file.name);
  return runMutation(env, {
    ownerId, idempotencyKey: key, mutation: 'ticket.attachments',
    path: `/api/services/tickets/${encodeURIComponent(id)}/attachments`, formData,
  });
}

async function runMutation(env, options) {
  const result = await callSupport(env, { method: 'POST', ...options });
  if (!result.acknowledgeable) return result;
  const acknowledgement = await acknowledgeSupport(env, options);
  return acknowledgement.confirmed ? result : { classification: 'ambiguous', acknowledgeable: false, retryAfter: null };
}

async function loadActiveRequests(env, ownerId, usable) {
  const loaded = [];
  let failures = 0;
  const owner = await callSupport(env, { method: 'GET', path: '/api/services/tickets', ownerId });
  if (owner.classification === 'success') loaded.push(...owner.data); else failures += 1;
  for (const row of usable.emails) {
    const discovery = await callSupport(env, { method: 'GET', path: '/api/services/tickets', ownerId, verifiedEmail: row.address });
    if (discovery.classification === 'success') loaded.push(...discovery.data); else failures += 1;
  }
  if (!loaded.length && failures) return errorActive(ACTIVE_FAILURE);
  const active = readyActive(mergeTickets(loaded));
  if (failures || usable.decryptSkipped) Object.assign(active, { error: SUPPORT_PARTIAL_NOTICE, retryHref: '/support?section=active' });
  return active;
}

async function loadClosedHistory(env, ownerId, cursor, suppliedRetryHref = null) {
  if (cursor === undefined || (cursor !== null && !decodeCursor(cursor).ok)) return errorClosed(CLOSED_FAILURE, suppliedRetryHref || '/support/closed');
  const path = cursor === null ? '/api/services/tickets/closed' : `/api/services/tickets/closed?cursor=${encodeURIComponent(cursor)}`;
  const result = await callSupport(env, { method: 'GET', path, ownerId });
  const retryHref = cursor === null ? '/support/closed' : `/support/closed?cursor=${encodeURIComponent(cursor)}`;
  return result.classification === 'success' && result.data.tickets.length <= 25
    ? { state: 'ready', requests: result.data.tickets, nextCursor: result.data.nextCursor }
    : errorClosed(CLOSED_FAILURE, retryHref);
}

async function loadDetailOwnerFirst(env, ownerId, id, usable) {
  const owner = await loadDetail(env, id, ownerId);
  if (owner.classification !== 'notFound') return owner;
  for (const row of usable.emails) {
    const found = await loadDetail(env, id, ownerId, row.address);
    if (found.classification !== 'notFound') return found;
  }
  return owner;
}

function loadDetail(env, id, ownerId, verifiedEmail) {
  return callSupport(env, { method: 'GET', path: `/api/services/tickets/${encodeURIComponent(id)}`, ownerId, verifiedEmail });
}

async function signedSupportSessionOrRedirect(req, env, path) {
  const nowMs = Date.now();
  const session = await getValidSession(req, env, nowMs);
  return session ? { session, nowMs } : signInRedirect(env, path, '');
}

async function usableVerifiedEmails(env, accountId) {
  const rows = await listAccountEmails(env.DB, accountId);
  const emails = [];
  let decryptSkipped = false;
  for (const row of rows) {
    if (row.verified_at == null) continue;
    try { emails.push({ address: await decryptEmail(row.address_encrypted, env), isPrimary: row.is_primary === 1 }); } catch { decryptSkipped = true; }
  }
  return { emails, decryptSkipped };
}

function freshForms() {
  return {
    reply: { operationKey: mintKey(), attachmentOperationKey: mintKey() },
    resolution: { operationKey: mintKey(), solvedOperationKey: mintKey() },
    close: { operationKey: mintKey() },
  };
}

function createSection(message = '') {
  return { state: 'ready', message, operationKey: mintKey(), attachmentOperationKey: mintKey() };
}

async function renderCreateState(env, guard, { values = {}, keys = null, message = '', outcome = null, createConfirmation = null, attachmentRetry = null } = {}) {
  const create = { ...createSection(message), values, outcome, createConfirmation, attachmentRetry };
  if (keys) Object.assign(create, keys);
  return supportHtml(renderSupportList({ csrf: await csrfToken(env), nowMs: guard.nowMs, sections: {
    active: hiddenSection(), closed: hiddenSection(), create,
  }}));
}

function submittedKeys(form) {
  const operationKey = String(form.get('operation_key') || '');
  const attachmentOperationKey = String(form.get('attachment_operation_key') || '');
  return validOperationKey(operationKey) && validOperationKey(attachmentOperationKey) && operationKey !== attachmentOperationKey
    ? { operationKey, attachmentOperationKey } : null;
}

function createValues(form) {
  return { product: String(form.get('product') || ''), subject: String(form.get('subject') || '').trim(), description: String(form.get('description') || '').trim() };
}

function validCreate(values) {
  return ['solstone', 'vit', 'general'].includes(values.product) && values.subject.length > 0 && values.description.length > 0;
}

function validOperationKey(value) { return OPERATION_KEY.test(value); }
function mintKey() { return randomBase64Url(32); }
function selectedFiles(form) { return form.getAll('file').filter((value) => value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && value.size > 0); }
function readyActive(requests) { return { state: 'ready', requests, notices: [] }; }
function errorActive(error) { return { state: 'error', requests: [], notices: [], error, retryHref: '/support?section=active' }; }
function errorClosed(error, retryHref) { return { state: 'error', requests: [], nextCursor: null, error, retryHref }; }
function hiddenSection() { return { state: 'hidden' }; }
function errorOutcome(message) { return { kind: 'error', message }; }
function reviewOutcome(message) { return { ...errorOutcome(message), requiresReview: true }; }

function outcomeFor(result, fallback = 'this action could not be confirmed. try again with the same action.') {
  const messages = {
    operationInProgress: `this action is still in progress.${result.retryAfter ? ` try again in ${result.retryAfter}.` : ' try again with the same action.'}`,
    idempotencyConflict: 'this action does not match the earlier action. review it before starting a new one.',
    invalidIdempotencyKey: 'this action key is not valid. review the action before starting a new one.',
    invalidState: 'this request changed before this action could be completed.',
    notFound: 'we could not find that request.',
    operationErased: 'this earlier action can no longer be repeated.',
    operationRetired: 'this earlier action is permanently suppressed. review a new action to continue.',
    ambiguous: fallback,
  };
  const outcome = errorOutcome(messages[result.classification] || fallback);
  if (!preserveKey(result) && result.classification !== 'invalidState') outcome.requiresReview = true;
  return outcome;
}

function attachmentRetryMessage(result) {
  return result.classification === 'idempotencyConflict'
    ? 'those files do not match the earlier batch. review a new attachment action.'
    : 'the files were not confirmed. reselect the same files in the same order to try again.';
}

function preserveKey(result) {
  return result.classification === 'ambiguous' || result.classification === 'operationInProgress';
}

function hasRemovalConfirmation(form) {
  return form.get('confirmation') === 'remove_details' && form.get('confirmation_control') === 'checkbox';
}

async function checkedForm(req, env) {
  const form = await readForm(req);
  if (!form) return null;
  return timingSafeEqual(String(form.get('csrf') || ''), await csrfToken(env)) ? form : false;
}
async function csrfToken(env) { return hashKey('csrf', 'account', env); }
async function readForm(req) { try { return await req.formData(); } catch { return null; } }
function supportIdFromPath(path) { const parts = typeof path === 'string' ? path.split('/') : []; return parts.length === 3 && parts[1] === 'support' && SUPPORT_ID_REGEX.test(parts[2]) ? parts[2] : null; }
function supportHtml(body, init = {}) { return html(body, { ...init, headers: { ...NO_STORE, ...(init.headers || {}) } }); }
function supportNotFoundResponse() { return supportHtml(renderSupportNotFound(), { status: 404 }); }
function noStore(response) { response.headers.set('Cache-Control', 'no-store'); return response; }
