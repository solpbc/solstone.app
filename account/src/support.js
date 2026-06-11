/**
 * Assumed support service API envelope for this lode. VPE verifies the real
 * worker post-ship; keep all response parsing in this module so an envelope
 * mismatch is a one-spot change.
 *
 * GET /api/services/tickets -> { tickets: [{ id, subject, status, updated_at }] }
 *   or a bare top-level array.
 * POST /api/services/tickets -> { id } or { ticket: { id } }.
 * GET /api/services/tickets/{id} -> {
 *   ticket: { id, subject, status, updated_at },
 *   messages: [{
 *     author_kind, content, created_at,
 *     attachments: [{ filename, status, triage_summary }]
 *   }],
 *   attachments: [{ filename, status, triage_summary }] // compatibility-only
 * }
 *   or a flat ticket shape with messages/attachments at top level.
 * POST /api/services/tickets/{id}/messages -> success/failure only.
 * POST /api/services/tickets/{id}/attachments -> success/failure only.
 */

import { decryptEmail, hashKey, timingSafeEqual } from './crypto.js';
import { listAccountEmails } from './db.js';
import { signInRedirect } from './enable.js';
import {
  renderSupportDetail,
  renderSupportList,
  renderSupportNotFound,
} from './html.js';
import { forbidden, html, originAllowed } from './index.js';
import { getValidSession } from './session.js';
import { loadMenuContext } from './settings.js';
import { SUPPORT_ID_REGEX } from './support-constants.js';

const SUPPORT_ORIGIN = 'https://support.internal';
const SUPPORT_LOAD_FAILURE = "we couldn't load your support right now. try again soon.";
const SUPPORT_PARTIAL_NOTICE = 'some support history could not be loaded.';
const SUPPORT_CREATE_FAILURE = "we couldn't open that request. try again.";
const SUPPORT_FORM_FAILURE = "we couldn't open that request. check the form and try again.";
const SUPPORT_REPLY_FAILURE = "we couldn't add that reply. try again.";
const SUPPORT_UPLOAD_FAILURE = 'your attachments could not be uploaded.';
const NO_STORE = { 'Cache-Control': 'no-store' };

export function supportSignInPrompt(path) {
  if (path === '/support') {
    return "sign in with your email to see your support. we'll send a 6-digit code — no password, no account to create.";
  }
  const id = supportIdFromPath(path);
  if (!id) return null;
  return `sign in with your email to see request #${id}. we'll send a 6-digit code.`;
}

export async function handleSupportList(req, env) {
  const guard = await signedSupportSessionOrRedirect(req, env, '/support');
  if (guard instanceof Response) return guard;
  const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
  return renderSupportListForSession(env, guard.session, guard.nowMs, menu);
}

export async function handleSupportCreate(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await signedSupportSessionOrRedirect(req, env, '/support');
  if (guard instanceof Response) return guard;
  const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
  const form = await readForm(req);
  if (!form) {
    return renderSupportListForSession(env, guard.session, guard.nowMs, menu, {
      failure: SUPPORT_FORM_FAILURE,
    });
  }
  const csrf = await csrfToken(env);
  if (!timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) return noStore(forbidden());

  const product = form.get('product')?.toString() || '';
  const subject = (form.get('subject')?.toString() || '').trim();
  const description = (form.get('description')?.toString() || '').trim();
  if (!['solstone', 'vit'].includes(product) || !subject || !description) {
    return renderSupportListForSession(env, guard.session, guard.nowMs, menu, {
      failure: SUPPORT_FORM_FAILURE,
    });
  }

  const usable = await usableVerifiedEmails(env, guard.session.account_id);
  if (usable.emails.length === 0) {
    return supportHtml(renderSupportList({
      csrf,
      failure: SUPPORT_LOAD_FAILURE,
      nowMs: guard.nowMs,
      menu,
    }));
  }

  const createEmail = usable.emails.find((row) => row.isPrimary) || usable.emails[0];
  const create = await callSupport(env, {
    method: 'POST',
    path: '/api/services/tickets',
    verifiedEmail: createEmail.address,
    json: { product, subject, description },
  });
  if (create.kind !== 'ok') {
    return renderSupportListForSession(env, guard.session, guard.nowMs, menu, {
      failure: SUPPORT_CREATE_FAILURE,
      usable,
    });
  }

  const id = parseCreatedId(create.data);
  if (!id) {
    return renderSupportListForSession(env, guard.session, guard.nowMs, menu, {
      failure: SUPPORT_CREATE_FAILURE,
      usable,
    });
  }

  let uploadFailed = false;
  const files = selectedFiles(form);
  if (files.length > 0) {
    const upload = await uploadAttachments(env, {
      id,
      verifiedEmail: createEmail.address,
      files,
    });
    uploadFailed = upload.kind !== 'ok';
  }

  return supportHtml(renderSupportList({
    requests: [{ id, subject, status: 'open', updatedAtMs: guard.nowMs }],
    csrf,
    nowMs: guard.nowMs,
    notices: usable.decryptSkipped ? [SUPPORT_PARTIAL_NOTICE] : [],
    createConfirmation: { id, email: createEmail.address, uploadFailed },
    menu,
  }));
}

export async function handleSupportDetail(req, env, id) {
  if (!SUPPORT_ID_REGEX.test(id || '')) return supportNotFoundResponse();
  const path = `/support/${id}`;
  const guard = await signedSupportSessionOrRedirect(req, env, path);
  if (guard instanceof Response) return guard;
  const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
  return renderSupportDetailForSession(env, guard.session, id, guard.nowMs, menu);
}

export async function handleSupportReply(req, env, id) {
  if (!SUPPORT_ID_REGEX.test(id || '')) return supportNotFoundResponse();
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await signedSupportSessionOrRedirect(req, env, `/support/${id}`);
  if (guard instanceof Response) return guard;
  const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
  const form = await readForm(req);
  if (!form) return renderSupportDetailForSession(env, guard.session, id, guard.nowMs, menu, { failure: SUPPORT_REPLY_FAILURE });
  const csrf = await csrfToken(env);
  if (!timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) return noStore(forbidden());

  const content = (form.get('content')?.toString() || '').trim();
  if (!content) return renderSupportDetailForSession(env, guard.session, id, guard.nowMs, menu, { failure: SUPPORT_REPLY_FAILURE });

  const usable = await usableVerifiedEmails(env, guard.session.account_id);
  if (usable.emails.length === 0) {
    return supportHtml(renderSupportList({
      csrf,
      failure: SUPPORT_LOAD_FAILURE,
      nowMs: guard.nowMs,
      menu,
    }));
  }

  let replyEmail = null;
  for (const row of usable.emails) {
    const reply = await callSupport(env, {
      method: 'POST',
      path: `/api/services/tickets/${encodeURIComponent(id)}/messages`,
      verifiedEmail: row.address,
      json: { content },
    });
    if (reply.kind === 'notFound') continue;
    if (reply.kind === 'failure') {
      return renderSupportDetailForSession(env, guard.session, id, guard.nowMs, menu, {
        failure: SUPPORT_REPLY_FAILURE,
        usable,
      });
    }
    replyEmail = row.address;
    break;
  }

  if (!replyEmail) return supportNotFoundResponse(menu);

  const notices = usable.decryptSkipped ? [SUPPORT_PARTIAL_NOTICE] : [];
  const files = selectedFiles(form);
  if (files.length > 0) {
    const upload = await uploadAttachments(env, { id, verifiedEmail: replyEmail, files });
    if (upload.kind !== 'ok') notices.push(SUPPORT_UPLOAD_FAILURE);
  }

  const detail = await loadDetailForEmail(env, id, replyEmail);
  if (detail.kind === 'notFound') return supportNotFoundResponse(menu);
  if (detail.kind !== 'ok') {
    return renderSupportDetailForSession(env, guard.session, id, guard.nowMs, menu, {
      failure: SUPPORT_LOAD_FAILURE,
      usable,
    });
  }
  return supportHtml(renderSupportDetail({
    ...detail.data,
    csrf,
    nowMs: guard.nowMs,
    notices,
    menu,
  }));
}

async function renderSupportListForSession(env, session, nowMs, menu, {
  failure = '',
  usable = null,
} = {}) {
  const csrf = await csrfToken(env);
  const verified = usable || await usableVerifiedEmails(env, session.account_id);
  if (verified.emails.length === 0) {
    return supportHtml(renderSupportList({
      csrf,
      failure: SUPPORT_LOAD_FAILURE,
      nowMs,
      menu,
    }));
  }
  if (failure) {
    return supportHtml(renderSupportList({
      csrf,
      failure,
      nowMs,
      notices: verified.decryptSkipped ? [SUPPORT_PARTIAL_NOTICE] : [],
      menu,
    }));
  }

  let okCount = 0;
  let failureCount = 0;
  const loaded = [];
  for (const row of verified.emails) {
    const outcome = await callSupport(env, {
      method: 'GET',
      path: '/api/services/tickets',
      verifiedEmail: row.address,
    });
    if (outcome.kind === 'ok') {
      okCount += 1;
      loaded.push(...parseTickets(outcome.data));
    } else {
      failureCount += 1;
    }
  }

  if (okCount === 0) {
    return supportHtml(renderSupportList({
      csrf,
      failure: SUPPORT_LOAD_FAILURE,
      nowMs,
      menu,
    }));
  }

  const notices = [];
  if (failureCount > 0 || verified.decryptSkipped) notices.push(SUPPORT_PARTIAL_NOTICE);
  return supportHtml(renderSupportList({
    requests: mergeTickets(loaded),
    csrf,
    nowMs,
    notices,
    menu,
  }));
}

async function renderSupportDetailForSession(env, session, id, nowMs, menu, {
  failure = '',
  usable = null,
} = {}) {
  const csrf = await csrfToken(env);
  const verified = usable || await usableVerifiedEmails(env, session.account_id);
  if (verified.emails.length === 0) {
    return supportHtml(renderSupportList({
      csrf,
      failure: SUPPORT_LOAD_FAILURE,
      nowMs,
      menu,
    }));
  }
  if (failure) {
    return supportHtml(renderSupportList({
      csrf,
      failure,
      nowMs,
      notices: verified.decryptSkipped ? [SUPPORT_PARTIAL_NOTICE] : [],
      menu,
    }));
  }

  for (const row of verified.emails) {
    const detail = await loadDetailForEmail(env, id, row.address);
    if (detail.kind === 'notFound') continue;
    if (detail.kind === 'failure') {
      return supportHtml(renderSupportList({
        csrf,
        failure: SUPPORT_LOAD_FAILURE,
        nowMs,
        notices: verified.decryptSkipped ? [SUPPORT_PARTIAL_NOTICE] : [],
        menu,
      }));
    }
    const notices = verified.decryptSkipped ? [SUPPORT_PARTIAL_NOTICE] : [];
    return supportHtml(renderSupportDetail({
      ...detail.data,
      csrf,
      nowMs,
      notices,
      menu,
    }));
  }
  return supportNotFoundResponse(menu);
}

async function signedSupportSessionOrRedirect(req, env, path) {
  const nowMs = Date.now();
  const session = await getValidSession(req, env, nowMs);
  if (session) return { session, nowMs };
  return signInRedirect(env, path, '');
}

async function usableVerifiedEmails(env, accountId) {
  const rows = await listAccountEmails(env.DB, accountId);
  const emails = [];
  let decryptSkipped = false;
  for (const row of rows) {
    if (row.verified_at == null) continue;
    try {
      emails.push({
        id: row.id,
        address: await decryptEmail(row.address_encrypted, env),
        isPrimary: row.is_primary === 1,
      });
    } catch {
      decryptSkipped = true;
      console.warn(JSON.stringify({ event: 'support_email_decrypt_failed', row_id: row.id }));
    }
  }
  return { emails, decryptSkipped };
}

async function callSupport(env, { method, path, verifiedEmail, json = null, formData = null }) {
  if (!env.SUPPORT_WORKER || !env.SERVICES_AUTH_TOKEN) return { kind: 'failure' };
  const headers = new Headers({
    'X-Services-Auth': env.SERVICES_AUTH_TOKEN,
    'X-Verified-Email': verifiedEmail,
  });
  let body;
  if (json != null) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  } else if (formData != null) {
    body = formData;
  }
  try {
    const response = await env.SUPPORT_WORKER.fetch(new Request(`${SUPPORT_ORIGIN}${path}`, {
      method,
      headers,
      body,
    }));
    if (response.status === 404) return { kind: 'notFound' };
    if (!response.ok) return { kind: 'failure' };
    return { kind: 'ok', data: await response.json() };
  } catch {
    return { kind: 'failure' };
  }
}

async function loadDetailForEmail(env, id, verifiedEmail) {
  const detail = await callSupport(env, {
    method: 'GET',
    path: `/api/services/tickets/${encodeURIComponent(id)}`,
    verifiedEmail,
  });
  if (detail.kind !== 'ok') return detail;
  const parsed = parseDetail(detail.data);
  return parsed ? { kind: 'ok', data: parsed } : { kind: 'failure' };
}

async function uploadAttachments(env, { id, verifiedEmail, files }) {
  const formData = new FormData();
  for (const file of files) formData.append('file', file, file.name);
  return callSupport(env, {
    method: 'POST',
    path: `/api/services/tickets/${encodeURIComponent(id)}/attachments`,
    verifiedEmail,
    formData,
  });
}

function parseTickets(data) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.tickets) ? data.tickets : [];
  return rows.map(parseTicket).filter(Boolean);
}

function parseTicket(row) {
  const id = stringValue(row?.id);
  if (!id || !SUPPORT_ID_REGEX.test(id)) return null;
  return {
    id,
    subject: stringValue(row?.subject) || 'request',
    status: stringValue(row?.status) || 'open',
    updatedAtMs: normalizeTimestamp(row?.updated_at),
  };
}

function parseCreatedId(data) {
  const id = stringValue(data?.id) || stringValue(data?.ticket?.id);
  return id && SUPPORT_ID_REGEX.test(id) ? id : null;
}

function parseDetail(data) {
  const ticket = parseTicket(data?.ticket || data);
  if (!ticket) return null;
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  const topLevel = Array.isArray(data?.attachments) ? data.attachments : [];
  const nested = messages.flatMap((message) => (
    Array.isArray(message?.attachments) ? message.attachments : []
  ));
  return {
    request: ticket,
    messages: messages.map(parseMessage),
    attachments: [...topLevel, ...nested].map(parseAttachment),
  };
}

function parseMessage(row) {
  return {
    author_kind: stringValue(row?.author_kind) || '',
    content: stringValue(row?.content) || '',
    createdAtMs: normalizeTimestamp(row?.created_at),
  };
}

function parseAttachment(row) {
  return {
    filename: stringValue(row?.filename) || 'attachment',
    status: stringValue(row?.status) || 'pending',
    triage_summary: stringValue(row?.triage_summary) || '',
  };
}

function mergeTickets(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return Array.from(byId.values()).sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
}

function normalizeTimestamp(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function stringValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function supportIdFromPath(path) {
  if (typeof path !== 'string') return null;
  const parts = path.split('/');
  if (parts.length !== 3 || parts[1] !== 'support') return null;
  return SUPPORT_ID_REGEX.test(parts[2]) ? parts[2] : null;
}

function selectedFiles(form) {
  return form.getAll('file').filter((value) => (
    value &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    typeof value.arrayBuffer === 'function' &&
    value.size > 0
  ));
}

async function csrfToken(env) {
  return hashKey('csrf', 'account', env);
}

async function readForm(req) {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}

function supportHtml(body, init = {}) {
  return html(body, {
    ...init,
    headers: { ...NO_STORE, ...(init.headers || {}) },
  });
}

function supportNotFoundResponse(menu) {
  return supportHtml(renderSupportNotFound({ menu }), { status: 404 });
}

function noStore(response) {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
