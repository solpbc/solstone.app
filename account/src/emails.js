import {
  decryptEmail,
  encryptEmail,
  generateOtp,
  hashKey,
  hashWithPepper,
  normalizeCode,
} from './crypto.js';
import {
  bumpAccountEmailVerificationAttempts,
  bumpRateBucket,
  findAccountEmailByAddressHash,
  findAccountEmailById,
  findEmailEligibilityByHash,
  findVerifiedAccountEmailById,
  getAccountTransparencyRow,
  insertAccountEmailVerification,
  listAccountEmails,
  listTransparencyPasskeys,
  listTransparencySessions,
  makeAccountEmailPrimary,
  matchAndVerifyAccountEmail,
  removeAccountEmail,
  resetAccountEmailVerification,
} from './db.js';
import { sendVerifyEmail } from './email.js';
import {
  formatDate,
  renderEmailVerify,
  renderSignInEmails,
  renderTransparency,
  VERIFY_ERROR,
} from './html.js';
import { forbidden, isValidEmail, originAllowed } from './index.js';
import {
  aaguidLabel,
  noStore,
  requireSignedInSession,
  signedInHtml,
  signedInRedirect,
  truncateIp,
  uaLabel,
} from './settings.js';

const EMAIL_VERIFY_TTL_MS = 10 * 60 * 1000;
const EMAIL_VERIFY_MAX_ATTEMPTS = 5;
const ADD_EMAIL_DAY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const DECRYPT_KIND_ADDRESS = 'address';
const DECRYPT_KIND_IP = 'ip';

export async function handleSignInEmails(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  return renderEmailsPage(env, guard.session, guard.nowMs);
}

export async function handleAddEmail(req, env, ctx) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;

  const form = await req.formData();
  const addressLower = (form.get('address')?.toString() || '').trim().toLowerCase();
  if (!isValidEmail(addressLower)) {
    return renderEmailsPage(env, guard.session, guard.nowMs, {
      addError: 'enter a valid email address.',
      status: 400,
    });
  }

  const nowMs = guard.nowMs;
  const code = generateOtp();
  const codeHash = await hashWithPepper(code, env);
  const addressLowerHash = await hashWithPepper(addressLower, env);
  const rateKey = await hashKey('add_email_per_day', guard.session.account_id, env);
  const verifyLocation = `/sign-in/emails/verify?address=${encodeURIComponent(addressLower)}`;

  if (env.EMAIL_PATH_DISABLED === 'true') {
    logAddCollision(guard.session.account_id, nowMs);
    return signedInRedirect(verifyLocation);
  }

  const addCount = await bumpRateBucket(env.DB, rateKey, DAY_MS, nowMs);
  if (addCount > ADD_EMAIL_DAY_LIMIT) {
    logAddCollision(guard.session.account_id, nowMs);
    return signedInRedirect(verifyLocation);
  }

  const existing = await findEmailEligibilityByHash(env.DB, addressLowerHash);
  if (!existing) {
    await insertAccountEmailVerification(env.DB, {
      id: crypto.randomUUID(),
      accountId: guard.session.account_id,
      addressEncrypted: await encryptEmail(addressLower, env),
      addressLowerHash,
      codeHash,
      expiresAt: nowMs + EMAIL_VERIFY_TTL_MS,
      nowMs,
    });
    queueVerifyEmail(ctx, { env, address: addressLower, code });
  } else if (existing.account_id === guard.session.account_id && existing.verified_at == null) {
    await resetAccountEmailVerification(env.DB, {
      id: existing.id,
      accountId: guard.session.account_id,
      codeHash,
      expiresAt: nowMs + EMAIL_VERIFY_TTL_MS,
    });
    queueVerifyEmail(ctx, { env, address: addressLower, code });
  } else if (existing.account_id !== guard.session.account_id) {
    logAddCollision(guard.session.account_id, nowMs);
  }

  return signedInRedirect(verifyLocation);
}

export async function handleVerifyEmailGet(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;

  const url = new URL(req.url);
  const rawAddress = url.searchParams.get('address') || '';
  const addressLower = rawAddress.trim().toLowerCase();
  if (!isValidEmail(addressLower)) {
    return signedInHtml(renderEmailVerify({
      address: '',
      addressInputValue: rawAddress.trim(),
      error: '',
      alreadyVerified: false,
    }));
  }

  const addressLowerHash = await hashWithPepper(addressLower, env);
  const row = await findAccountEmailByAddressHash(env.DB, {
    accountId: guard.session.account_id,
    addressLowerHash,
  });
  return signedInHtml(renderEmailVerify({
    address: addressLower,
    addressInputValue: '',
    error: '',
    alreadyVerified: row?.verified_at != null,
  }));
}

export async function handleVerifyEmailPost(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;

  const form = await req.formData();
  const rawAddress = form.get('address')?.toString() || '';
  const addressLower = rawAddress.trim().toLowerCase();
  const code = normalizeCode(form.get('code')?.toString() || '');
  const addressOk = isValidEmail(addressLower);
  const codeOk = /^\d{6}$/.test(code);

  if (!addressOk || !codeOk) {
    return signedInHtml(renderEmailVerify({
      address: addressOk ? addressLower : '',
      addressInputValue: addressOk ? '' : rawAddress.trim(),
      error: VERIFY_ERROR,
      alreadyVerified: false,
    }));
  }

  const nowMs = guard.nowMs;
  const codeHash = await hashWithPepper(code, env);
  const addressLowerHash = await hashWithPepper(addressLower, env);
  const matched = await matchAndVerifyAccountEmail(env.DB, {
    accountId: guard.session.account_id,
    addressLowerHash,
    codeHash,
    nowMs,
  });

  if (matched) return signedInRedirect('/sign-in/emails');

  await bumpAccountEmailVerificationAttempts(env.DB, {
    accountId: guard.session.account_id,
    addressLowerHash,
    nowMs,
    maxAttempts: EMAIL_VERIFY_MAX_ATTEMPTS,
  });
  return signedInHtml(renderEmailVerify({
    address: addressLower,
    addressInputValue: '',
    error: VERIFY_ERROR,
    alreadyVerified: false,
  }));
}

export async function handleMakeEmailPrimary(req, env, emailId) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  if (!emailId) return signedInRedirect('/sign-in/emails');

  const row = await findVerifiedAccountEmailById(env.DB, {
    id: emailId,
    accountId: guard.session.account_id,
  });
  if (!row) return signedInRedirect('/sign-in/emails');

  await makeAccountEmailPrimary(env.DB, {
    id: emailId,
    accountId: guard.session.account_id,
  });
  return signedInRedirect('/sign-in/emails');
}

export async function handleRemoveEmail(req, env, emailId) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  if (!emailId) return signedInRedirect('/sign-in/emails');

  const changes = await removeAccountEmail(env.DB, {
    id: emailId,
    accountId: guard.session.account_id,
  });
  if (changes === 1) return signedInRedirect('/sign-in/emails');

  const row = await findAccountEmailById(env.DB, {
    id: emailId,
    accountId: guard.session.account_id,
  });
  if (!row) return signedInRedirect('/sign-in/emails');

  return renderEmailsPage(env, guard.session, guard.nowMs, {
    removeError: 'cannot remove this email — your sign-in needs at least one verified email',
    status: 403,
  });
}

export async function handleSignInData(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;

  const accountId = guard.session.account_id;
  const [account, emailRows, passkeyRows, sessionRows] = await Promise.all([
    getAccountTransparencyRow(env.DB, accountId),
    listAccountEmails(env.DB, accountId),
    listTransparencyPasskeys(env.DB, accountId),
    listTransparencySessions(env.DB, accountId),
  ]);
  const emails = await Promise.all(emailRows.map((row) => transparencyEmailRow(row, env)));
  const sessions = await Promise.all(sessionRows.map((row) => transparencySessionRow(row, env)));
  const passkeys = passkeyRows.map(transparencyPasskeyRow);

  return signedInHtml(renderTransparency({
    accountId,
    accountCreatedAt: account?.created_at ?? null,
    lastSigninAt: account?.last_signin_at ?? null,
    emails,
    passkeys,
    sessions,
  }));
}

async function renderEmailsPage(env, session, nowMs, {
  addError = '',
  removeError = '',
  status = 200,
} = {}) {
  const rows = await listAccountEmails(env.DB, session.account_id);
  const viewRows = await Promise.all(rows.map((row) => emailViewRow(row, env, nowMs)));
  return signedInHtml(renderSignInEmails({ rows: viewRows, addError, removeError }), { status });
}

function queueVerifyEmail(ctx, { env, address, code }) {
  ctx.waitUntil(sendVerifyEmail({ env, address, code }).catch(() => console.error('verify_send_failed')));
}

function logAddCollision(actorAccountId, nowMs) {
  console.warn(JSON.stringify({ event: 'add_addr_collision', actor_account_id: actorAccountId, ts: nowMs }));
}

function logTransparencyDecryptFailed(rowId, kind) {
  console.warn(JSON.stringify({ event: 'transparency_decrypt_failed', row_id: rowId, kind }));
}

async function emailViewRow(row, env, nowMs) {
  const address = await decryptStoredValue(row.address_encrypted, env);
  const verified = row.verified_at != null;
  const badge = row.is_primary ? 'primary' : verified ? 'verified' : 'unverified';
  return {
    id: row.id,
    address,
    encodedAddress: encodeURIComponent(address),
    badge,
    addedText: `added ${formatDate(row.created_at)}`,
    expiryText: badge === 'unverified' ? codeExpiryText(row.verification_expires_at, nowMs) : '',
  };
}

async function transparencyEmailRow(row, env) {
  let address = '<decrypt failed>';
  try {
    address = await decryptEmail(row.address_encrypted, env);
  } catch {
    logTransparencyDecryptFailed(row.id, DECRYPT_KIND_ADDRESS);
  }
  return {
    address,
    isPrimary: row.is_primary === 1,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
  };
}

async function transparencySessionRow(row, env) {
  let ipLabel = '—';
  if (row.last_ip_encrypted) {
    try {
      ipLabel = truncateIp(await decryptEmail(row.last_ip_encrypted, env));
    } catch {
      ipLabel = '<decrypt failed>';
      logTransparencyDecryptFailed(row.id_hash, DECRYPT_KIND_IP);
    }
  }
  return {
    deviceLabel: uaLabel(row.last_user_agent),
    ipLabel,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

function transparencyPasskeyRow(row) {
  const friendlyName = typeof row.friendly_name === 'string' && row.friendly_name.trim()
    ? row.friendly_name
    : null;
  const mappedLabel = friendlyName ? null : aaguidLabel(row.aaguid);
  return {
    name: friendlyName || mappedLabel || 'passkey',
    aaguid: row.aaguid || '—',
    credentialId: row.credential_id,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

async function decryptStoredValue(encryptedValue, env) {
  try {
    return await decryptEmail(encryptedValue, env);
  } catch {
    return '<decrypt failed>';
  }
}

function codeExpiryText(expiresAt, nowMs) {
  const expires = Number(expiresAt);
  if (!Number.isFinite(expires) || expires <= nowMs) return 'code expired — request a new one';
  const diff = expires - nowMs;
  if (diff < 60_000) return 'code expires in less than 1 minute';
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return `code expires in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `code expires in ${hours} hour${hours === 1 ? '' : 's'}`;
}
