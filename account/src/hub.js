// Durable alert helper for T4 security events. POST a typed
// security event to the extro-hub webhook ingress (durable, git-tracked CSO
// request + queue-visible alert), so the audit trail survives the ephemeral
// Worker log. Mirrors the solpbc.org contact-form hub-event pattern: fire via
// waitUntil so it never blocks the response, no-op when unconfigured, and NEVER
// include raw tokens, credentials, or other secret material.
export function emitSecurityEvent(env, ctx, payload) {
  if (!env.HUB_WEBHOOK_URL) return;
  const body = JSON.stringify({ office: 'cso', ts: new Date().toISOString(), ...payload });
  const task = fetch(env.HUB_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Secret': env.HUB_WEBHOOK_SECRET || '',
    },
    body,
  }).catch(() => {});
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(task);
}
