// Step-up proof ceremony for passkey/email changes at services.solstone.app.
// A checked, non-consuming freshness window over the same
// account_deletion_proofs table deletion/export already use, purpose
// 'credential-change': a verified OTP proof (plus a passkey proof whenever
// the account already has an active passkey) issued within the last
// PROOF_TTL_MS licenses any number of passkey/email mutations for that
// session, until it expires. Unlike delete/cancel/export, the proof is never
// explicitly consumed here — see db.js requireFreshProof's comment.
import { generateSessionToken, hashWithPepper } from './crypto.js';
import { createDeletionProof, CREDENTIAL_CHANGE_PURPOSE, PROOF_TTL_MS, requireFreshProof } from './db.js';
import {
  finishPasskeyProof,
  startEmailProof,
  startPasskeyProof,
  strictDeletionOriginAllowed,
  verifyEmailProof,
} from './deletion.js';
import { renderCredentialChangeProofPage } from './html.js';
import { loadMenuContext, noStore, requireSignedInSession, signedInHtml, signedInRedirect } from './settings.js';
import { forbidden } from './index.js';

// Called once, right after sign-in OTP verification mints a session. The
// sign-in OTP the owner just entered IS live proof of email control; seeding
// a pre-verified credential-change proof from it means a first-run passkey
// enrollment (the welcome panel, seconds after sign-in) rides the freshness
// window for free, and any change past the same PROOF_TTL_MS re-proves like
// everywhere else. otp_code_hash holds an opaque, never-presented value —
// this row is pre-verified and is never matched against a submitted code.
export async function seedCredentialChangeProofFromSignIn(env, { accountId, sessionIdHash, nowMs }) {
  const tokenHash = await hashWithPepper(generateSessionToken(), env);
  const opaqueCodeHash = await hashWithPepper(generateSessionToken(), env);
  await createDeletionProof(env.DB, {
    tokenHash,
    accountId,
    sessionIdHash,
    purpose: CREDENTIAL_CHANGE_PURPOSE,
    method: 'otp',
    issuedAt: nowMs,
    expiresAt: nowMs + PROOF_TTL_MS,
    otpCodeHash: opaqueCodeHash,
    verified: true,
  });
}

const ALLOWED_NEXT = new Set(['/sign-in', '/sign-in/passkeys', '/sign-in/emails']);

function safeNext(value) {
  return ALLOWED_NEXT.has(value) ? value : '/sign-in';
}

// Read-only check every credential-mutating route calls before its actual
// mutation. Never consumes the proof — a fresh window licenses more than one
// action, on purpose (a security-review recommendation).
export async function requireFreshCredentialChangeProof(env, { accountId, sessionIdHash }) {
  return requireFreshProof(env.DB, {
    accountId,
    sessionIdHash,
    purpose: CREDENTIAL_CHANGE_PURPOSE,
  });
}

// Redirect target every gated HTML/form route (emails.js, settings.js) sends
// an owner to when it finds no fresh proof. Exported so those modules build
// the exact same URL rather than each hand-rolling it. A 303 to a distinct
// path is never confused with the origin guard's bodyless 403
// (noStore(forbidden())) that gates the same handlers.
export function credentialChangeStepUpPath(next) {
  return `/account/credential-change/proof?next=${encodeURIComponent(safeNext(next))}`;
}

export async function handleCredentialChangeRoute(req, env, url = new URL(req.url)) {
  if (url.pathname === '/account/credential-change/proof' && req.method === 'GET') {
    const guard = await requireSignedInSession(req, env);
    if (guard instanceof Response) return guard;
    const next = safeNext(new URL(req.url).searchParams.get('next'));
    const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
    return signedInHtml(renderCredentialChangeProofPage({ menu, next }));
  }

  if (url.pathname === '/account/credential-change/proof/otp' && req.method === 'POST') {
    const guard = await credentialChangeGuard(req, env);
    if (guard instanceof Response) return guard;
    const form = await safeForm(req);
    const next = safeNext(form?.get('next')?.toString());
    try {
      await startEmailProof(env, {
        accountId: guard.session.account_id,
        sessionIdHash: guard.session.id_hash,
        purpose: CREDENTIAL_CHANGE_PURPOSE,
        ip: requestIp(req),
      });
    } catch (error) {
      const message = error?.message === 'proof_rate_limited'
        ? 'too many attempts; try again later'
        : 'a verified email is required to continue';
      const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
      return signedInHtml(renderCredentialChangeProofPage({ menu, next, error: message }), { status: 400 });
    }
    const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
    return signedInHtml(renderCredentialChangeProofPage({ menu, next, status: 'code sent' }));
  }

  if (url.pathname === '/account/credential-change/proof/otp/verify' && req.method === 'POST') {
    const guard = await credentialChangeGuard(req, env);
    if (guard instanceof Response) return guard;
    const form = await safeForm(req);
    const next = safeNext(form?.get('next')?.toString());
    let result;
    try {
      result = await verifyEmailProof(env, {
        accountId: guard.session.account_id,
        sessionIdHash: guard.session.id_hash,
        purpose: CREDENTIAL_CHANGE_PURPOSE,
        code: form?.get('code')?.toString() || '',
        ip: requestIp(req),
      });
    } catch (error) {
      if (error?.message !== 'proof_rate_limited') throw error;
      const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
      return signedInHtml(renderCredentialChangeProofPage({
        menu, next, error: 'too many attempts; try again later',
      }), { status: 429 });
    }
    if (result.ok) {
      const fresh = await requireFreshCredentialChangeProof(env, {
        accountId: guard.session.account_id,
        sessionIdHash: guard.session.id_hash,
      });
      if (fresh.otpVerified && fresh.passkeyVerified) return noStore(signedInRedirect(next));
    }
    const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
    return signedInHtml(renderCredentialChangeProofPage({
      menu,
      next,
      status: result.ok ? 'email verified. now verify your passkey too.' : '',
      error: result.ok ? '' : 'that code is invalid or expired.',
    }), { status: result.ok ? 200 : 400 });
  }

  if (url.pathname === '/account/credential-change/proof/passkey/start' && req.method === 'POST') {
    const guard = await credentialChangeGuard(req, env);
    if (guard instanceof Response) return guard;
    try {
      const result = await startPasskeyProof(env, {
        accountId: guard.session.account_id,
        sessionIdHash: guard.session.id_hash,
        purpose: CREDENTIAL_CHANGE_PURPOSE,
        ip: requestIp(req),
      });
      return result.ok ? jsonResponse({ options: result.options }) : jsonResponse({ error: 'no active passkey' }, 400);
    } catch (error) {
      return error?.message === 'proof_rate_limited'
        ? jsonResponse({ error: 'too many attempts; try again later' }, 429)
        : jsonResponse({ error: 'passkey verification could not start' }, 500);
    }
  }

  if (url.pathname === '/account/credential-change/proof/passkey/finish' && req.method === 'POST') {
    const guard = await credentialChangeGuard(req, env);
    if (guard instanceof Response) return guard;
    const body = await jsonBody(req);
    try {
      const result = await finishPasskeyProof(env, {
        accountId: guard.session.account_id,
        sessionIdHash: guard.session.id_hash,
        purpose: CREDENTIAL_CHANGE_PURPOSE,
        assertionResponse: body?.response,
        ip: requestIp(req),
      });
      if (!result.ok) return jsonResponse({ error: "passkey couldn't be verified" }, 400);
      const fresh = await requireFreshCredentialChangeProof(env, {
        accountId: guard.session.account_id,
        sessionIdHash: guard.session.id_hash,
      });
      return jsonResponse({ ok: true, ready: fresh.otpVerified && fresh.passkeyVerified });
    } catch (error) {
      return error?.message === 'proof_rate_limited'
        ? jsonResponse({ error: 'too many attempts; try again later' }, 429)
        : jsonResponse({ error: "passkey couldn't be verified" }, 500);
    }
  }

  return null;
}

async function credentialChangeGuard(req, env) {
  if (!strictDeletionOriginAllowed(req)) return noStore(forbidden());
  return requireSignedInSession(req, env);
}

async function safeForm(req) {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}

async function jsonBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function requestIp(req) {
  return req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
