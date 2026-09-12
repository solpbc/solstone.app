import { decryptEmail } from './crypto.js';
import { consumeFreshExportProofs, listAccountEmails } from './db.js';
import {
  finishPasskeyProof,
  startEmailProof,
  startPasskeyProof,
  strictDeletionOriginAllowed,
  verifyEmailProof,
} from './deletion.js';
import { renderExportPage, renderExportProofPage } from './html.js';
import { composeOwnerExportDocument } from './owner-export-compose.js';
import { collectOwnerLocalExport } from './owner-export-local.js';
import { ownerExportNotFound } from './owner-export-path.js';
import { collectOwnerRelayExport, relayExpectedInstanceIds } from './owner-export-relay.js';
import { collectOwnerSupportExport } from './owner-export-support.js';
import { loadMenuContext, requireSignedInSession, signedInHtml } from './settings.js';

const PURPOSE = 'export';
export const EXPORT_SERVICE_UNAVAILABLE = 'service unavailable';
export const EXPORT_PROOF_INVALID = "this download request isn't valid";
export const EXPORT_FILENAME = 'solstone-owner-export.json';

export async function handleOwnerExportRoute(req, env, url = new URL(req.url)) {
  if (url.pathname === '/account/export' && req.method === 'GET') {
    const guard = await requireSignedInSession(req, env);
    if (guard instanceof Response) return guard;
    const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
    return signedInHtml(renderExportPage({ menu }));
  }

  if (url.pathname === '/account/export' && req.method === 'POST') {
    const guard = await exportGuard(req, env);
    if (guard instanceof Response) return guard;

    const local = await collectOwnerLocalExport({
      db: env.DB,
      env,
      accountId: guard.session.account_id,
    });
    if (!local.ok) {
      return refusal(503, EXPORT_SERVICE_UNAVAILABLE);
    }

    const splClass = local.classes.find((c) => c.name === 'spl_bindings');
    const sppClass = local.classes.find((c) => c.name === 'spp_bindings');
    const splIds = (splClass?.records || []).map((r) => r.instance_id).filter(Boolean);
    const sppIds = (sppClass?.records || []).map((r) => r.instance_id).filter(Boolean);
    const relayIds = relayExpectedInstanceIds(splIds, sppIds);

    const relay = await collectOwnerRelayExport({
      env,
      instanceIds: relayIds,
    });

    const emailRows = await listAccountEmails(env.DB, guard.session.account_id);
    const verifiedEmails = [];
    let decryptFailed = false;
    for (const row of emailRows) {
      if (row.verified_at == null) continue;
      try {
        const decrypted = await decryptEmail(row.address_encrypted, env);
        verifiedEmails.push(decrypted);
      } catch {
        decryptFailed = true;
      }
    }

    const support = await collectOwnerSupportExport({
      env,
      accountId: guard.session.account_id,
      verifiedEmails,
      decryptFailed,
    });

    const document = composeOwnerExportDocument({
      generatedAtMs: guard.nowMs,
      local,
      relay,
      support,
    });

    const consumeResult = await consumeFreshExportProofs(env.DB, {
      accountId: guard.session.account_id,
      sessionIdHash: guard.session.id_hash,
      nowMs: guard.nowMs,
    });
    if (!consumeResult.authorized) {
      return refusal(403, EXPORT_PROOF_INVALID);
    }

    return new Response(JSON.stringify(document), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename=${EXPORT_FILENAME}`,
        'Cache-Control': 'no-store',
      },
    });
  }

  if (url.pathname === '/account/export/proof/otp' && req.method === 'POST') {
    const guard = await exportGuard(req, env);
    if (guard instanceof Response) return guard;
    try {
      await startEmailProof(env, {
        accountId: guard.session.account_id,
        sessionIdHash: guard.session.id_hash,
        purpose: PURPOSE,
        ip: requestIp(req),
      });
    } catch (error) {
      if (error?.message === 'proof_rate_limited') return refusal(429, 'too many verification attempts; try again later');
      if (error?.message === 'deletion_proof_email_missing') return refusal(400, 'a verified email is required to continue');
      console.error('owner export email verification could not start');
      return refusal(500, "email verification couldn't start");
    }
    const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
    return signedInHtml(renderExportProofPage({ menu, status: 'code sent' }));
  }

  if (url.pathname === '/account/export/proof/otp/verify' && req.method === 'POST') {
    const guard = await exportGuard(req, env);
    if (guard instanceof Response) return guard;
    const form = await req.formData();
    let result;
    try {
      result = await verifyEmailProof(env, {
        accountId: guard.session.account_id,
        sessionIdHash: guard.session.id_hash,
        purpose: PURPOSE,
        code: form.get('code')?.toString() || '',
        ip: requestIp(req),
      });
    } catch (error) {
      if (error?.message === 'proof_rate_limited') return refusal(429, 'too many verification attempts; try again later');
      throw error;
    }
    const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
    return signedInHtml(renderExportProofPage({
      menu,
      status: result.ok ? 'email verified' : '',
      error: result.ok ? '' : 'that code is invalid or expired.',
    }), { status: result.ok ? 200 : 400 });
  }

  if (url.pathname === '/account/export/proof/passkey/start' && req.method === 'POST') {
    const guard = await exportGuard(req, env);
    if (guard instanceof Response) return guard;
    try {
      const result = await startPasskeyProof(env, {
        accountId: guard.session.account_id,
        sessionIdHash: guard.session.id_hash,
        purpose: PURPOSE,
        ip: requestIp(req),
      });
      return result.ok ? jsonResponse({ options: result.options }) : jsonError(400, 'no active passkey');
    } catch (error) {
      return error?.message === 'proof_rate_limited'
        ? jsonError(429, 'too many verification attempts; try again later')
        : jsonError(500, "passkey verification couldn't start");
    }
  }

  if (url.pathname === '/account/export/proof/passkey/finish' && req.method === 'POST') {
    const guard = await exportGuard(req, env);
    if (guard instanceof Response) return guard;
    const body = await jsonBody(req);
    try {
      const result = await finishPasskeyProof(env, {
        accountId: guard.session.account_id,
        sessionIdHash: guard.session.id_hash,
        purpose: PURPOSE,
        assertionResponse: body?.response,
        ip: requestIp(req),
      });
      return result.ok ? jsonResponse({ ok: true }) : jsonError(400, "passkey couldn't be verified");
    } catch (error) {
      return error?.message === 'proof_rate_limited'
        ? jsonError(429, 'too many verification attempts; try again later')
        : jsonError(500, "passkey couldn't be verified");
    }
  }

  return ownerExportNotFound();
}

async function exportGuard(req, env) {
  if (!strictDeletionOriginAllowed(req)) return refusal(403, EXPORT_PROOF_INVALID);
  return requireSignedInSession(req, env);
}

function requestIp(req) {
  return req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';
}

async function jsonBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function refusal(status, message) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function jsonError(status, error) {
  return jsonResponse({ error }, status);
}
